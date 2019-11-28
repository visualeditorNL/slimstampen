// execute script when the whole page has been loaded
$(document).ready(function(){
    
    // set up the js namespace (PG), although it should already be defined
    if (typeof PG == "undefined") PG = {};

    // ### DEFINE MODEL: ADD CHANGES HERE

    // extend PG.studyModel. The new name must be the same as the module (and .js) name
    PG.irsSpacing = Object.create(PG.studyModel);

    // ### override variables of PG.studyModel
    
    // define thname of the model, e.g. 'control'
    // this name is used in the retrieval of persistent item data,
    // so changing it will mean that old data cannot be retrieved
    PG.irsSpacing.modelName = 'IRS';
    
    // Show debug in the javascript console
    PG.irsSpacing.debug = false;
    PG.irsSpacing.fitDebug = false;
    
    // session length in seconds
    PG.irsSpacing.sessionLength = 25*60;
    
    // number of items that are elligible for presentation
    PG.irsSpacing.numActiveItems = 0;
    
    // how often an item has been presented
    //PG.pavlikSpacing.presentations = [];
    
    // all decay values per item
    PG.irsSpacing.decays = [];   

    // all previous encounters
    PG.irsSpacing.encounters = [];
    
    // all previous observed RT values
    PG.irsSpacing.RTs = [];
    
    // the alphas for each item
    PG.irsSpacing.alpha = [];
    
    // F value used to compute RT
    PG.irsSpacing.F = 1;
    
    // activation threshold of forgetting
    PG.irsSpacing.threshold = -0.8;
    
    // RT estimated for this trial using the model
    PG.irsSpacing.estimatedRT = 0;
    
    PG.irsSpacing.presHistory = [];
    // FORMULA VARIABLES   
    
    // ### override functions of PG.studyModel

    // override PG.studyModel.init
    PG.irsSpacing.init = function (newItems, autoComp, errorDist, sessLen) {
        this.sessionLength = sessLen*60;
		// 60 was originally 17: to reflect the duration of the exam.
        this.studyDuration = 60*1000;
        this.testDuration = 60*1000;
        this.correctFeedbackDuration = 600;
        this.incorrectFeedbackDuration = 4000;
        
        this.allowAutoComplete = autoComp;
        this.maxErrorDistance = errorDist;

        this.setItems(newItems);
    };
    
    // override PG.studyModel.setItems
    PG.irsSpacing.setItems = function (newItems) {
        // PG.tools is a collection of useful functions, such as shuffle and levenshtein
        // HvR: this.items = PG.tools.shuffleItems(newItems);
        this.items = newItems
        var timeStamp = PG.tools.getTimeStamp();
        
        // initialize various lists containing item info
        var oItems = []; // 'old' items
        var nItemsHigh = []; // 'new' items, high priority
        var nItemsMedium = []; // medium priority
        var nItemsLow = []; // low priority
        var n;
        for (n=0; n<this.items.length; ++n) {
            // activation offset
            this.items[n].mOs = 0;
            this.items[n].priority = parseInt(this.items[n].priority);
            
            // use persistent item data, when available
            // NOTE: persistent number data must be parsed as int or float first!
            if (this.items[n].persistent != null) {
                // set the correct number of presentations
                this.items[n].numPresentations = parseInt(this.items[n].persistent.presentations);
                //this.items[n].prevSessPres = this.items[n].numPresentations;
                
                // the alphas
                this.alpha.push(parseFloat(this.items[n].persistent.params.alpha));
                // time in days since last encounter
                var numDays = (timeStamp - parseInt(this.items[n].persistent.lastUpdate))/(60*60*24);
                
                // calculate the activation offset which accounts for forgetting between sessions
                this.items[n].mOs = this.activationOffset(parseFloat(this.items[n].persistent.params.mFuture),
                                                          parseFloat(this.items[n].persistent.params.mEnd),
                                                          parseFloat(this.items[n].persistent.params.alpha),
                                                          numDays);
                
                // previous encounters
                this.encounters.push([0]);
                
                // previous decay values
                this.decays.push([parseFloat(this.items[n].persistent.params.decay)]);
                
                // previous observed RTs
                this.RTs.push([parseFloat(this.items[n].persistent.params.RT)]);
                
                // sort the old from the new items
                oItems.push(this.items[n]);
                this.numActiveItems += 1;
                if (this.debug) console.log('Persistent data loaded for item',this.items[n].id,': mOs:',this.items[n].mOs);
            }
            else { // never before presented item
                 // previous decay values
                this.decays.push([]);
                // previous encounters
                this.encounters.push([]);
                // previous observed RTs
                this.RTs.push([]);
                // set initial alpha
                this.alpha.push(0.3);

                // order new items based on priority
                switch(this.items[n].priority) {
                    case 1:
                        nItemsMedium.push(this.items[n]);
                        break;
                    case 2:
                        nItemsLow.push(this.items[n]);
                        break;
                    default:
                        nItemsHigh.push(this.items[n]);
                        break;
                }
                //nItems.push(this.items[n]);
            }
        }
        
        if (this.numActiveItems == 0) // no old items loaded
            this.numActiveItems = 1;
        else
            this.currentItemIdx = 0; // old items, start at the beginning of the list

        // put all new items at the back of the item list
        this.items = oItems.concat(nItemsHigh.concat(nItemsMedium.concat(nItemsLow)));
        
    };
    
    // override PG.studyModel.getNextEvent
    PG.irsSpacing.getNextEvent = function (sessionDuration) {
        sessionDuration /= 1000; // use seconds, not miliseconds

        // has the maximum study time passed?
        if (this.elapsedTime > this.sessionLength) {
            // end session
            return this.stopSessionEvent();
        }

        this.eventCount += 1; // keep track of the total number of trials
        
        // first presentation (of first session)
        if (this.items[0].numPresentations == 0) {
            if(this.debug) console.log('SESSION STARTED');
            this.currentItemIdx = 0;
            
            this.addFirstEncounter(sessionDuration);
            
            return this.newStudyEvent(this.items[this.currentItemIdx]);
        }
        // every subsequent presentation/session
        else {
            if(this.debug) console.log('NEW TRIAL');
            
            var minAct = Infinity;
            var nextItemIdx = -1;
            
            // check if any items have dropped below the threshold
            for (var i=0; i<this.numActiveItems; ++i) {
                if (this.numActiveItems > 2 && i == this.currentItemIdx) {
                    continue; // don't present the same item twice in a row
                }
                // lookahead 15 sec
                var act = this.activation(this.encounters[i], this.decays[i], sessionDuration+15, this.items[this.currentItemIdx].mOs)
                // console.log('var act', act);
                if (act < minAct) {
                    minAct = act;
                    nextItemIdx = i;
                }
            }
            
            // present the item if it is below the threshold
            if (minAct < this.threshold) { 
                if (this.debug) console.log ('BELOW THRESHOLD: item ', nextItemIdx,'minAct',minAct);
                // make this item the item to present
                this.currentItemIdx = nextItemIdx;
                
                // add encounter to item history
                this.addEncounter(sessionDuration);
                
                // item has been presented before, so present a test trial
                return this.newTestEvent(this.items[this.currentItemIdx]);
            }
            else {
                // check if there are any new items remaining
                if ( (this.items.length-this.numActiveItems) > 0 ) {
                    // increase the number of active items, set last item as active
                    var newItemIdx = this.numActiveItems;
                    this.numActiveItems += 1;
                    this.currentItemIdx = newItemIdx;
                    
                    if (this.debug) console.log ('NEW ITEM: item ',newItemIdx,'. Num active items: ', this.numActiveItems);
                    // add first encounter
                    this.addFirstEncounter(sessionDuration);
                    
                    // present new item next as a study trial
                    return this.newStudyEvent(this.items[this.currentItemIdx]);
                }
                else {
                    // just present the item with the smallest activation found earlier, as it's closest to forgetting
                    if (this.debug) console.log ('NO NEW, PRESENT LOWEST');
                    this.currentItemIdx = nextItemIdx;
                    
                    // add presentation for this item
                    this.addEncounter(sessionDuration);
                    
                    return this.newTestEvent(this.items[this.currentItemIdx]);
                }
            }
        }
    };

    // override PG.studyModel.processResponse
    PG.irsSpacing.processResponse = function (response, RT, trialDuration, sessionDuration, savePersistent) {
        this.presHistory.push(this.currentItemIdx);
        if(this.debug) console.log('HISTORY',this.presHistory);
        
        // scale time to seconds
        this.prevElapsedTime = this.elapsedTime;
        this.elapsedTime = sessionDuration/1000;
        var RTmili = RT;
        RT /= 1000;
        
		// Alot of altered close. Watch closely when it doesn't work.
		var isCorrect = false;
		 
		// determine max distance from answer length
        var maxDistance = this.maxErrorDistance;
        var distance = -1;
        var answer = "";
        
		// If this is a multiple choice item, use answerMC, otherwise just answer:
        //if(this.items[this.currentItemIdx].answer.indexOf("~")!=-1){
            //isCorrect = (response.toLowerCase() === this.items[this.currentItemIdx].answerMC.toLowerCase());
            //if (isCorrect) {
                //// Distance is used to determine which feedback is given, a distance of 0 means correct.
                //distance = 0;
            //} else {
                //// A Levenshtein distance larger than maxDistance will always mean it's completely wrong.
                //distance = maxDistance+1;
            //}
        //} else {
			// check the Damerau-Levenshtein distance
            console.log (this.items[this.currentItemIdx].answer);
            console.log (this.items[this.currentItemIdx].answer.toLowerCase());
			answer = this.items[this.currentItemIdx].answer.toLowerCase();
			distance = PG.tools.damerauLevenshtein(response.toLowerCase(), answer);
    
			if (answer.length < 5) {
				maxDistance = Math.max(maxDistance-1, 0);
			}
            if (this.debug) {
                console.log("Levenshtein distance " + distance + " <= " + maxDistance);
            }
			// if the distance is within bounds, count it as correct
			isCorrect = (distance <= maxDistance) ? true : false;
        //}
        if (isCorrect) { // correct recall
            if (this.debug) {
                console.log('correct');
            }
        }
        else {
            if (this.debug) {
                console.log('incorrect');
            }
            RT = this.testDuration/1000;
        }
        
        // limit the influence of large reaction times by limiting with a max reaction time
        RT = Math.min(RT, this.maxRT(this.currentItemIdx));        
        this.RTs[this.currentItemIdx].push(RT);

       //if (this.debug) console.log('- RT: ', RT, ' numEnc ', this.encounters[this.currentItemIdx].length,' numRT ',this.RTs[this.currentItemIdx].length );
        
        // update alpha value for this item
        if (this.items[this.currentItemIdx].numPresentations < 3) {
            this.alpha[this.currentItemIdx] = 0.3;
        }
        else { // presentations 3 and beyond
            var a0 = -Infinity;
            var a1 = Infinity;
            var aFit = this.alpha[this.currentItemIdx];
            
            var estDiff = this.estimatedRT - RT;
            var aNew = 0;
            
            //if (this.fitDebug) console.log ('estRT ', this.estimatedRT,' obsRT ',RT, 'DIFF: ', RT - this.estimatedRT);
            if (this.fitDebug) console.log ('DIFF: ', RT - this.estimatedRT);
            
            if (estDiff < 0) {
                //if (this.fitDebug) console.log ('observed activation lower than model: slower response than expected');
                // estimated RT was too short (estimated m too high), so actual decay was larger
                aNew = aFit + 0.05; // larger decay = larger alpha
            }
            else {
                //if (this.fitDebug) console.log ('observed activation higher than model: faster response than expected');
                // estimated RT was too long (estimated m too low), so actual decay was smaller
                aNew = aFit - 0.05; // smaller decay = smaller alpha
            }
            
            if (aNew > aFit) {
                a0 = aFit;
                a1 = aNew;
            }
            else {
                a0 = aNew;
                a1 = aFit;
            }
            
            // binary search between previous fit and new alpha
            for (var j=0; j<6; ++j) {
                var ac = (a0+a1) / 2;
        
                // adjust all decays to use the new alpha (easy since alpha is just an offset)
                var a0Diff = a0 - aFit;
                var a1Diff = a1 - aFit;

                var dA0 = [];
                var dA1 = [];                
                for (var k=0; k<this.decays[this.currentItemIdx].length; ++k) {
                    dA0.push(this.decays[this.currentItemIdx][k] + a0Diff);
                    dA1.push(this.decays[this.currentItemIdx][k] + a1Diff);
                }
                
                var totalA0Error = 0;
                var totalA1Error = 0;
                
                // get the last n encounters, skip the first study encounter
                windowStart = Math.max(1, this.encounters[this.currentItemIdx].length - 5);

                // calculate the reaction times from activation and compare against observed reaction times
                for (var i=windowStart; i<this.encounters[this.currentItemIdx].length; ++i) {
                    // observed RT
                    var rtObs = this.RTs[this.currentItemIdx][i];
                    
                    // predicted RT
                    var mA0 = this.activation(this.encounters[this.currentItemIdx], 
                                              dA0, this.encounters[this.currentItemIdx][i]-0.1,
                                              this.items[this.currentItemIdx].mOs);
                    var mA1 = this.activation(this.encounters[this.currentItemIdx],
                                              dA1, this.encounters[this.currentItemIdx][i]-0.1,
                                              this.items[this.currentItemIdx].mOs);
                    
                    var rtA0 = this.RTfromM(mA0);
                    var rtA1 = this.RTfromM(mA1);

                    // calculate error
                    totalA0Error += Math.abs(rtObs-rtA0);
                    totalA1Error += Math.abs(rtObs-rtA1);
                }
                
                //if (MODEL.fitDebug) cat('-- totalA0Error ', totalA0Error,' totalA1Error ', totalA1Error,'\n')
                
                // adjust the search area based on total error
                if (totalA0Error < totalA1Error) {
                    a1 = ac; // search between a0 and ac
                }
                else {
                    a0 = ac; // search between ac and a1
                }
            }
            
            // narrowed range, take average of the two values as the new alpha for this item
            this.alpha[this.currentItemIdx] = (a0+a1) / 2;
            
            // update all old decays to use the new alpha
            var newDiff = this.alpha[this.currentItemIdx] - aFit;
            for (var k=0; k<this.decays[this.currentItemIdx].length; ++k) {
                this.decays[this.currentItemIdx][k] += newDiff;
            }
            
            if (this.fitDebug) console.log('REFIT ALPHA: ', this.alpha[this.currentItemIdx],' (old: ',aFit,', estimate: ',aNew,')');
        }

        // save result
        var pars = PG.tools.encodeParameters('time', this.elapsedTime, // extra values to be saved
                                             'levdist', distance,
                                             'presentation', this.items[this.currentItemIdx].numPresentations,
                                             'alpha', PG.tools.round(this.alpha[this.currentItemIdx], 4),
                                             'fixedRT',PG.tools.round(this.sentenceFixedTime(this.currentItemIdx),4),
                                             'estRT', PG.tools.round(this.estimatedRT,4)
                                             );
        this.saveEvent(response, isCorrect, RTmili, this.elapsedTime-this.prevElapsedTime, pars);
        
        // item activation 30 minutes from now
        var mFut = this.activation(this.encounters[this.currentItemIdx], this.decays[this.currentItemIdx],
                                   this.sessionLength+60*30, this.items[this.currentItemIdx].mOs);
        // item activation at the end of the session
        var mEnd = this.activation(this.encounters[this.currentItemIdx], this.decays[this.currentItemIdx],
                                   this.sessionLength, this.items[this.currentItemIdx].mOs);
        
        if (savePersistent) {
            // save persistent item data
            var persistPars = PG.tools.encodeParameters('alpha', PG.tools.round(this.alpha[this.currentItemIdx], 4),
                                                        'mFuture', PG.tools.round(mFut, 4),
                                                        'mEnd', PG.tools.round(mEnd, 4),
                                                        'decay', PG.tools.round(this.decays[this.currentItemIdx][this.decays[this.currentItemIdx].length-1], 4),
                                                        'RT', RT
                                                        );
            this.saveItemData(persistPars);
        }
        
        // handle feedback
        if (distance == 0) {
            return this.newCorrectFeedbackEvent(TXT_CORRECT);
        }
        else if (distance <= maxDistance) {
            return this.newAlmostCorrectFeedbackEvent(TXT_ALMOST_CORRECT);
        }
        else {
            return this.newIncorrectFeedbackEvent(TXT_INCORRECT);
        }
    };

    // add the first encounter (study trial) of an item to the model
    PG.irsSpacing.addFirstEncounter = function(time) {
        // first presentation
        this.items[this.currentItemIdx].numPresentations += 1;
        
        // activation on the first presentation is -Inf
        this.decays[this.currentItemIdx].push(this.decay(-Infinity, 0.3));
        
        // add encounter time
        this.encounters[this.currentItemIdx].push(time);

        // predict the RT for this encounter, which will be compared against the observed value to adjust the alpha
        var mi = this.activation(this.encounters[this.currentItemIdx], this.decays[this.currentItemIdx],
                                 time, this.items[this.currentItemIdx].mOs);
        this.estimatedRT = this.RTfromM(mi);

        if (this.debug) console.log('ADDED FIRST ENCOUNTER item id:', this.currentItemIdx, ' decay: ', this.decays[this.currentItemIdx][0], ' time: ', time,'\n')     
    }

    // add subsequent encounters of an item to the model
    PG.irsSpacing.addEncounter = function (time) {
        // get current activation
        var m = this.activation(this.encounters[this.currentItemIdx], this.decays[this.currentItemIdx],
                                time, this.items[this.currentItemIdx].mOs);
        
        // calculate decay of the current activation
        var d = this.decay(m, this.alpha[this.currentItemIdx]);

        // add presentation
        this.items[this.currentItemIdx].numPresentations += 1;

        // add encounter time
        this.encounters[this.currentItemIdx].push(time);
        
        // add decay belonging to this encounter
        this.decays[this.currentItemIdx].push(d);
        
        // predict the RT for this encounter, which will be compared against the observed value to adjust the alpha
        var mi = this.activation(this.encounters[this.currentItemIdx], this.decays[this.currentItemIdx],
                                 time, this.items[this.currentItemIdx].mOs);
        this.estimatedRT = this.RTfromM(mi);
	
        if (this.debug) console.log ('ADDED ENCOUNTER item id:',this.currentItemIdx, ' activation: ',m,' decay: ', d, ' time: ', time, 'mOs: ', this.items[this.currentItemIdx].mOs);
    };

    // calculate activation of a certain item at a specific time
    PG.irsSpacing.activation = function (encounters, dk, curTime, mOs) {
        var sumTk = 0;
        
        for (var i=0; i<encounters.length; ++i) {
            if (encounters[i] < curTime) { // only include encounters seen before curTime
                sumTk += Math.pow(curTime-encounters[i], -dk[i]);
            }
        }
        
        // psychological time does not make sense for new items
        oldAct = 0;
        if (mOs < 0) oldAct = Math.exp(mOs);
        
        return Math.log(sumTk+oldAct);
    };

    // calculate a new decay value based on the activation m and alpha a
    PG.irsSpacing.decay = function (m, a) {
        var c = 0.25;
        return c*Math.exp(m) + a;
    };

    // estimate RT from activation m
    PG.irsSpacing.RTfromM = function(m) {
        var f = this.sentenceFixedTime(this.currentItemIdx);//0.300;
        return this.F*Math.exp(-m) + f;
    };
    
    // put an upper bound on the RT to limit the effect of really long RTs
    PG.irsSpacing.maxRT = function(itemIdx) {
        var sf = this.sentenceFixedTime(itemIdx);
        return 1.5*(this.F*Math.exp(-this.threshold) + sf);
    };
    
    // estimate fixed (reading) time for a given sentence
    PG.irsSpacing.sentenceFixedTime = function(itemIdx) {
        var numWords = PG.tools.wordCount(this.items[itemIdx].itemText);
        // based on old reading time experiment:
        //var sc = 0.3;
        //if (this.items[itemIdx].numPresentations < 2) {
        //    sc = 0.6;
        //}
        
        // dirty fix:
        if (this.items[itemIdx].itemVisual != null) {
            return 0.800;
        }
        else {
            if (numWords > 1) {
                var Ccount = PG.tools.charCount(this.items[itemIdx].itemText);
                // old estimate from reading time experiment:
                //return Math.max( ((1180 + 44.3*Ccount)/1000)*sc, 0.300 );
                // new estimate from pilot data:
                return Math.max((-157.9 + Ccount*19.5)/1000, 0.300);
            }
            else { // use tried and true approach for single word stimuli
                return 0.300;
            }
        }
    };
    
    // calculate the activation offset which is used to account for forgetting between sessions
    PG.irsSpacing.activationOffset = function(mFut, mEnd, alpha, numDays) {
        var actOff = mFut - alpha*Math.log(numDays)
        if (this.debug) console.log('actOff - mFut:',mFut,'mEnd:',mEnd,'actOff:',actOff,'alpha:',alpha,'days:',numDays);
        return Math.min(mEnd, actOff);
    };

    // allow user to 'reset' an item in order to decrease its presentation rate
    // TODO: automize this? a 'sanity' check that scans how often an item has appeared in the last x trials.
    // if this is really high, then reset the item
    PG.irsSpacing.makeItemAppearLess = function(perform) {

        if (perform == null) {
            // acknowledge that this model supports this feature
            return true;
        }
        else {
//console.log('reducing item',this.currentItemIdx,'presentations');

            var itemIdx = this.currentItemIdx;
            var oldAlpha = this.alpha[itemIdx];
            this.alpha[itemIdx] *= 0.3;
            
//console.log('old alpha:',oldAlpha,'new alpha:',this.alpha[itemIdx]);

            // reset to the last encounter
            this.encounters[itemIdx] = [ this.encounters[itemIdx].pop() ];
            
            // reset to updated version of last decay
            var diff = this.alpha[itemIdx] - oldAlpha;

//console.log('old decays',this.decays[itemIdx]);

            this.decays[itemIdx] = [this.decay(-Infinity, this.alpha[itemIdx])]; //[ this.decays[itemIdx].pop() + diff ];

//console.log('new decays',this.decays[itemIdx]);

            // reset to last RT
            this.RTs[itemIdx] = [ this.RTs[itemIdx].pop() ];
        }
    };
});
