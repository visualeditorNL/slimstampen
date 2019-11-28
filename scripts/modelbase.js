$(document).ready(function(){

    // set up the js namespace (PG)
    if (typeof PG == "undefined") PG = {};

    if (typeof Object.create !== 'function') {
        Object.create = function (o) {
            function F() {}
            F.prototype = o;
            return new F();
        };
    }

    // Add ECMA262-5 Array methods if not supported natively
    //
    if (!('indexOf' in Array.prototype)) {
        Array.prototype.indexOf= function(find, i /*opt*/) {
            if (i===undefined) i= 0;
            if (i<0) i+= this.length;
            if (i<0) i= 0;
            for (var n= this.length; i<n; i++)
                if (i in this && this[i]===find)
                    return i;
            return -1;
        };
    }

    // Array Remove - By John Resig (MIT Licensed)
    Array.prototype.remove = function(from, to) {
        var rest = this.slice((to || from) + 1 || this.length);
        this.length = from < 0 ? this.length + from : from;
        return this.push.apply(this, rest);
    };

    // load global ui functions
    PG.global = {
        // New code. Delete if it doesn't work.
        // length of the question to calculate its space
        questionLength : 0,
        // number of answer options if multiple choice
        numAnswers : 0,
        // End of new code.
        // time offset for the session start
        sessionStartTime : 0,
        // the current session Id
        sessionId : 1,
        // time offset for the timer
        timerStart : 0,
        // how long the study has already been going on
        studyTimeOffset : 0,
        // total alotted study time
        studySessionLength : 0,
        // number of trials used to calculate the score
        numScoreCount : 20,
        // trial results
        scoreCountTrials : [],
        //timerElapsed : 0,
        // number of (test) events to queue up before saving
        maxQueuedEvents : 1,
        // events queued for saving
        queuedEvents : [],
        // queued persistent item data for saving
        queuedItemData : [],
        // the study scheduling model
        model : null,
        // keep track of the timeout callback
        timeoutId : null,
        // time before the timeout kicks in
        timeoutDuration : 0,
        // keep track of the clock
        clockId : null,
        // track whether the first key has been pressed (for RT)
        firstKeyPressed : false,
        // is the user able to input?
        allowInput : true,
        // track the current even type
        currentEventType : '',
        // RT of the current trial
        currentRT : Number.MAX_VALUE,

        // current match found by auto complete
        autoCompleteMatch : '',

        // the maximum height of a stimuli image, defined by the item template
        maxVisualHeight : 400,
        // is the experiment environment used?
        expEnv : false,
        // remember session time after stopping?
        rememberTime : false,
        // show all items, or the hardest ones
        itemSelection : 0,

        // initialize all settings
//        init : function (sModel, itemlist, listIds, autoComps, levDists, sessionId, modelId,
//                         sessionLen, timeOffset, itemSelect, expenv) {

        subjectId: -1,
        blockNumber: -1,

        // Random key preventing of write to same file
        nonce: Math.floor(Math.random() * 1000000),

        init : function (sModel, itemlist, useBlock, autoComp, levDist, sessionId, modelId,
                         sessionLen, timeOffset, itemSelect, expenv, useHints) {

            that = this; // workaround for js 'scope' bug
            this.model = sModel;
            this.sessionId = sessionId;
            this.studyTimeOffset = timeOffset;
            this.studySessionLength = sessionLen;
            this.itemSelection = itemSelect,
            this.expEnv = expenv;
            this.useHints = useHints;

            if (this.model.modelName == 'default') {
                $('#message').text(TXT_ERROR_MODEL_LOAD);
            }
            else {
                $('#message').text(TXT_LOADING_SESSION);

                // intialize associative arrays linking list numbers to autocomplete and error distance settings
                var doAutoComplete = autoComp;
                var errorDistance = levDist;

                $("#item-test").hide();
                $("#item-study").hide();

                // initialize model (load item lists, etc.)
                var items = PG.global.loadListItems(itemlist, useBlock);
                if (items != null) {
                    this.model.init(items, doAutoComplete, errorDistance, sessionLen);

                    // HvR: remove unnecessary information from "start studying screen"
                    $('#logo').hide();
                    $('#footer').hide();
                    $('.mainmenu').hide();
                    // HvR: End
                    $('#message').text(TXT_START_STUDYING);
                }
                else
                    $('#message').text(TXT_ERROR_ITEM_LOAD);
            }

        },

        // start the study session
        start : function () {
            $("#message").hide();

            // remove all distractions from the screen
            $('#logo').hide();
            $('#current-list-overview').hide();
            $('#explanation').hide();
            $('#footer').hide();
            $('.mainmenu').hide();
            $('#itemdisplay').show();

            if (this.model.makeItemAppearLess())
                $('#reduce-current-item-presentations').show();

            // update the clock AND the elapsed time var in the stop button
            this.clockId = setInterval(function () { that.updateClock(); }, 1000);

            this.sessionStartTime = new Date().getTime() - this.studyTimeOffset;
            this.nextEvent();
        },

        // called when the current events' timeout has been reached
        timedOut : function () {
            this.currentRT = this.timeoutDuration;
            this.handleResponse();
        },

        // get the next event from the study model
        nextEvent : function () {

            this.firstKeyPressed = false;
            var newEvent = this.model.getNextEvent(this.getTotalElapsedTime());

            //var timeoutDuration = 0;

            // allow user to give input again
            this.allowInput = true;
            $('[name=response]').attr("disabled", false);
            $('[name=response]').focus();

            // make sure no item display is active
            $("#item-study").hide();
            $("#item-test").hide();
            $('#item-image').hide();

            // handle the event according to its type
            if (newEvent.eventType === 'test') {
                this.currentEventType = newEvent.eventType;

                                 // Change back if doesn't work.
                                // Modify this item if it is a multiple choice item:
                //newEvent.e = this.updateMultipleChoice(newEvent.e)
                // end of new work.

                this.displayTest(newEvent.e);
                this.timeoutDuration = newEvent.duration;
            }
            else if (newEvent.eventType === 'study') {
                this.currentEventType = newEvent.eventType;

                                // Change back if doesn't work.
                                // Modify this item if it is a multiple choice item:
                //newEvent.e = this.updateMultipleChoice(newEvent.e)
                                // end of new work

                this.displayStudy(newEvent.e);
                this.timeoutDuration = newEvent.duration;
            }
            else if (newEvent.eventType === 'stop') {
                this.halt();
                return;
            }
            else {
                $('[name=response]').attr("disabled", true); // no input allowed
            }

            if (newEvent.e.itemVisual != null) {
                $('#item-image').show();
                var imageUrl = '../images/items/' + newEvent.e.id + '.' + newEvent.e.itemVisual;

                var image = $('<img />', {src : imageUrl}).one('load', function() {
                     // use this.width, etc
                     var imageWidth = this.width;
                     var imageHeight = this.height;

                     if (imageHeight > PG.global.maxVisualHeight) {
                         var ratio = PG.global.maxVisualHeight / imageHeight;
                         imageHeight = PG.global.maxVisualHeight
                         imageWidth *= ratio;
                     }

                     $('#item-visual').attr('src',  imageUrl);
                     $('#item-visual').attr('width',  imageWidth);
                     $('#item-visual').attr('height',  imageHeight);

                }).each(function() {
                     if(this.complete) $(this).load();
                });

            }

            // set a timeout based on the maximum event duration
            this.timeoutId = setTimeout(function () { that.timedOut(); }, this.timeoutDuration);

            // reset timing
            this.currentRT = Number.MAX_VALUE;
            this.restartTimer();
        },

                // change back when it doesn't work:
                // called when an answer option is clicked
                mouseClicked : function (i){
                        this.currentRT = this.getElapsedTime();
                        clearTimeout(this.timeoutId);
                        this.timeoutId = setTimeout(function () { that.timedOut(); }, this.timeoutDuration*10);
                        $('[name=response]').val(i.toString());
                        if (PG.global.allowInput) {
                                PG.global.allowInput = false;
                                PG.global.handleResponse();
                        }
                },
                // end of new work.
        // called when a key is entered into the answer box
        // original: keyPressed : function (e) {
                keyPressed : function (e, clickAns) {
            //var RT = 0;
            if (!this.firstKeyPressed) {
                // first key press, get RT
                this.currentRT = this.getElapsedTime();
                //console.log('RT: ',RT);
                this.firstKeyPressed = true;

                // reset timer to give user a decent response time
                clearTimeout(this.timeoutId);
                this.timeoutId = setTimeout(function () { that.timedOut(); }, this.timeoutDuration*10);
            }
        },

        keyDown : function (e) {
            var keynum;
            if (e.which) { // Firefox
                keynum = e.which;
            }
            else if (e.which) { // IE
                keynum = e.keyCode;
            }

            if (keynum == 8) {  //backspace, which is also 'previous page' in browsers
                return false;
            }
            return true;
        },

        // process a response
        handleResponse : function () {
            // responded in time; the timeout is invalid now
            clearTimeout(this.timeoutId);
            // Hide any autocompletion windows that might be hovering.
            $('.complete').hide();

            // RT should not exceed trial length
            //this.currentRT = Math.min(this.timeoutDuration, this.currentRT);

            // in case of a test event, process the input given by the user
            if (this.currentEventType === 'test' || this.currentEventType === 'study' || this.currentEventType === 'hint') {
                var response = $('[name=response]').val();
                $('[name=response]').val('');

                // prevents parameter list from messing up when the response is included as extra trialresult parameter
                if (!response) {
                    response = '?';
                }

                response = response.replace('"',"'");

                // give result to the scheduling model
                var totalTestTime = this.getElapsedTime();
                var result = this.model.processResponse(response, this.currentRT,
                                                            this.getElapsedTime(),
                                                            this.getTotalElapsedTime(),
                                                            true);
                // store result for the score counter
                if (result.e.isCorrect > 0) {
                    this.scoreCountTrials.push(1);
                } else {
                    this.scoreCountTrials.push(0);
                }

                // If this was a test trial, and it was answered incorrectly, prepare a hint
                // trial. If the hint is answered correctly, it is automatically stored as
                // a correct response. This will counteract the previous incorrect response,
                // as the learner wasn't that far off. However, the estimation of the alpha
                // parameter will still take the incorrect into account, so the alpha will
                // remain low.
                if (this.useHints == 1 & this.currentEventType === 'test' & result.e.isCorrect == 0) {
                    this.currentEventType = 'hint';

                    // Note that this should be done in event handling functions. This is a hack
                    // to get Gesa's experiment working.
                    // allow user to give input again
                    this.firstKeyPressed = false;

                    this.allowInput = true;
                    $('[name=response]').attr("disabled", false);
                    $('[name=response]').focus();

                    // make sure no item display is active
                    $("#item-study").hide();
                    $("#item-test").hide();
                    $('#item-image').hide();

                    $("#feedback").removeClass().addClass('feedback-almost');
                    $("#feedback").html(TXT_TRYAGAIN);
                    $("#feedback").show();

                    this.displayHint(this.model.items[this.model.currentItemIdx]);
                    this.timeoutDuration = this.model.testDuration;

                    // set a timeout based on the maximum event duration
                    this.timeoutId = setTimeout(function () { that.timedOut(); }, this.timeoutDuration);

                    // reset timing
                    this.currentRT = Number.MAX_VALUE;
                    this.restartTimer();

                } else {
                    // do we display feedback?
                    if (result.showFeedback && (result.duration > 0)) {
                        $('[name=response]').attr("disabled", true); // don't allow input during feedback
                        this.displayFeedback(result.e);
                        setTimeout(this.finishedFeedback, result.duration);
                    }
                    else { // otherwise, get the next event
                        this.nextEvent();
                    }
                }
            }
            else {
                this.nextEvent();
            }

            this.updateScore();
        },

        reducePresentationRate : function () {

            // only allow if the model supports it
            if (this.model.makeItemAppearLess()) {

                clearTimeout(this.timeoutId);
                $('.complete').hide();

                if (this.currentEventType === 'test' || this.currentEventType === 'study') {
                    var response = $('[name=response]').val();
                    $('[name=response]').val('');

                    // 'special' response to identify skipped trials
                    var response = '?!?';

                    // give result to the scheduling model
                    var totalTestTime = this.getElapsedTime();
                    var result = this.model.processResponse(response, 0,
                                                            this.getElapsedTime(), this.getTotalElapsedTime(),
                                                            false);
                }

                this.model.makeItemAppearLess(true);

                // end current event, start a new one
                this.nextEvent();
            }
        },

        // feedback has been shown, proceed to the next event
        finishedFeedback : function () {
            $("#feedback").hide();
            $("#feedback-message").hide();
            $("#item").show();
            that.nextEvent();
        },

        // the session is finished
        halt : function () {
            this.stopSession();
            $("#item").hide();
            $("#message").text('');
            $("#message").append("<p>" + TXT_SESSION_DONE + "</p>");
            $("#message").append('<p><a href="' + FINISH_LINK + '" id="stop-session">'+TXT_RETURN_TO_OVERVIEW+'</a></p>');
            $("#message").show();

            $('[name=response]').attr("disabled", true);

            clearInterval(this.clockId);
        },

        // flush the remaining queued events
        stopSession : function () {
            this.maxQueuedEvents = 0;
        },


        // TIMING FUNCTIONS

        // reset elapsed time to zero
        restartTimer : function () {
            this.timerStart = new Date().getTime();
            //this.timerElapsed = 0;
        },

        // running time of the timer; timing is accurate to around 20ms
        getElapsedTime : function () {
            return new Date().getTime() - this.timerStart;
        },

         // running time of the session
        getTotalElapsedTime : function () {
            return new Date().getTime() - this.sessionStartTime;
        },

        // LOADING AND SAVING (AJAX)

        // retrieve study list items
        // listIds: the lists for which items are retrieved
        loadListItems : function (it, useBlock) {
            //items = it.items;
            curItem = 0;

            var items = [];

            console.log("Items used in this list:");
            console.log(useBlock);
            var midpoint = Math.floor(it.items.length/2);

            if (useBlock == 1) {
                console.log("First half");
                items = it.items;
                items = items.splice(0,midpoint);
            }

            if (useBlock == 2) {
                console.log("Second half");
                items = it.items;
                items = items.splice(midpoint,items.length-(midpoint));
            }

            if (items.length == 0) {
                console.log("All items");
                items = it.items;
            }

            for (var i=0; i< items.length; ++i) {
                console.log(items[i].itemText);
                items[i].numPresentations = 0;
                items[i].priority = 1;
            }

            return items;
        },

        saveEvent : function (iListId, _itemId, resp, isCorr, _RT, _duration, _type, cond, count, _pars) {
            function decodeParameters(pars) {
                /**
                 * I do not know what the encondeParameters function is for. Therefore, lets just
                 * decode the string again to later make a plain CSV file from all data.
                 */
                var result = {};
                var splits = pars.split(",");
                splits.forEach(function (s) {
                        function unpackQuotedString(s) {
                            return s.substr(1, s.length - 2)
                        }
                        var splits = s.split(":");
                        result[unpackQuotedString(splits[0])] = unpackQuotedString(splits[1]);
                    });
                return result;
            }

            var decodedPars = {};

            // As _pars aren't defined for the classicFlashCard learning,
            // create some dummy variables.
            if (typeof(_pars) == "undefined") {
				decodedPars.time = -1;
				decodedPars.levdist = -1;
				decodedPars.presentation = -1;
				decodedPars.alpha = -1;
				decodedPars.fixedRT = -1;
				decodedPars.estRT = -1;
            } else {
	        	decodedPars = decodeParameters(_pars);
	        }

            $.ajax({url: "saveScript.php",
                    type: "POST",
                    dataType: "text",
                    // ^FS: the original was:
                    // {id: "subject" + PG.global.subjectID + "_block" + PG.global.blockNumber,
                    data: {id: "subject_" + PG.global.subjectID,
                           line: [PG.global.subjectID,
                                  PG.global.blockNumber,
                                  _itemId,
                                  resp,
                                  isCorr,
                                  _RT,
                                  _duration,
                                  _type,
                                  cond,
                                  count,
                                  PG.global.useHints,
                                  decodedPars.time,
                                  decodedPars.levdist,
                                  decodedPars.presentation,
                                  decodedPars.alpha,
                                  decodedPars.fixedRT,
                                  decodedPars.estRT].join(","),
                           random: PG.global.nonce}
                    })
                .done(function(data) {
                        if (data.trim() == "OK") {
                            console.log("Saved data for item " + _itemId);
                        } else {
                        	console.log("Failed to save data to server:\n" + data); // ^FS: as a fail-safe
                            alert("Failed to save data to server:\n" + data);
                        }
                    })
                .fail(function() {
		                console.log("Failed to save data to server:\n" + data); // ^FS: as a fail-safe
                        alert("Server cannot be contacted to save data");
                    })
        },

        saveItemData : function (pars) {

        },

        // give a suggested response if the input sofar results in a single match from the answer set
        autoComplete : function (e) {
            if (this.model.allowsAutoComplete()) {
                if (e.which == 40) { // down key can be used to load the suggestion
                    if (this.autoCompleteMatch.length > 0) {
                        $('[name=response]').val(this.autoCompleteMatch);
                        $('.complete').attr('id', 'autocomplete-selected');
                    }
                }
                else {
                    var numMatches = 0;
                    var match = '';

                    // do auto complete for unique input values
                    $('.complete').hide();
                    $('.complete').attr('id', 'autocomplete');

                    var input = $('[name=response]').val().toLowerCase();

                    if (input.length > 6) {
                        // go through all the answers and see if there is a unique match
                        var numItems = this.model.getNumItems();

                        for (var i=0; i<numItems; ++i) {
                            var ans = this.model.getItem(i).answer.toLowerCase();
                            if (PG.tools.wordCount(ans) > 3) {
                                // answer is a sentence; apply a different suggestion rule

                                if (ans.indexOf(input) != -1 && PG.tools.wordCount(input) > 3) {
                                    numMatches += 1;
                                    match = this.model.getItem(i).answer;
                                }
                            }
                            else {
                                var distance = PG.tools.damerauLevenshtein(input, ans);
                                var sizeDiff = Math.abs(ans.length-input.length);
                                if (distance < 4 && sizeDiff < 3) {
                                    numMatches += 1;
                                    match = this.model.getItem(i).answer;
                                }
                            }
                        }

                        if (numMatches == 1) {
                            this.autoCompleteMatch = match;
                            $('.complete').text(match);
                            $('.complete').show();
                        }
                        else {
                            this.autoCompleteMatch = '';
                        }
                    }
                }
            }
        },
                // Delete following part if it doesn't work:
                // Multiple Choice Processing
        updateMultipleChoice : function(item) {
            // If this is a multiple choice item:
            if(item.answer.indexOf("~")!=-1){
                var answerOptions = item.answer.split("~");
                var corrAnswer = answerOptions[0];

                                // This code deletes answeroptions randomly until only 3 alternatives and 1 correct answer remains.
                                function delRandomOption(vec){
                                        vec.splice(Math.ceil(Math.random() * (vec.length-1)),1);
                                        return vec;
                                }
                                while (answerOptions.length > 4){
                                        answerOptions = delRandomOption(answerOptions);
                                }


                                var i = answerOptions.length, j, tempi, tempj;
                while ( --i ) {
                    j = Math.floor( Math.random() * ( i + 1 ) );
                    tempi = answerOptions[i];
                    tempj = answerOptions[j];
                    answerOptions[i] = tempj;
                    answerOptions[j] = tempi;
                }
                corrAnswer = (answerOptions.indexOf(corrAnswer)) + 1;
                item.answerMC = corrAnswer.toString();
                if (!item.itemTextOrg) {
                    item.itemTextOrg = item.itemText;
                }
                item.itemText = item.itemTextOrg + "<br>&nbsp;"
                                this.questionLength = item.itemTextOrg.length;
                                this.numAnswers = answerOptions.length;

                // Function that capitalizes the first letter of a string.
                function capFirstLetter(string){
                    return string.charAt(0).toUpperCase() + string.slice(1);
                }
                item.itemText = "<p id = \"questionMulti\" style = \"margin-top:0em;margin-bottom:0em;\">" + item.itemText + "<br>";
                for (var i = 1; i <= answerOptions.length; i++) {
                                        answerOptions[i-1] = capFirstLetter(answerOptions[i-1]);
                                        if (i == answerOptions.length) {
                                                item.itemText = item.itemText + "<button onclick=\"PG.global.mouseClicked("+ i +")\" style=\"text-align:left\">" + i.toString() + ": " + answerOptions[i-1] + "</button></p>";
                                        } else {
                                                item.itemText = item.itemText + "<button onclick=\"PG.global.mouseClicked("+ i +")\" style=\"text-align:left\">" + i.toString() + ": " + answerOptions[i-1] + "</button><br>";
                                        }
                                };
                                item.answerTextMulti = "<p id = \"answerStudy\" style = \"margin-top:0em;margin-bottom:0em;\">" + item.answer.split("~")[0] + "</p>";
            }
                        else if (item.itemText.indexOf("</p>") == -1) {
                                item.itemText = "<p id = \"question\" style = \"margin-top:0em;margin-bottom:0em;\">" + item.itemText + "</p>";
                                item.answerText = "<p id = \"answerStudy\" style = \"margin-top:0em;margin-bottom:0em;\">" + item.answer + "</p>";
                        }
            return item
        },
                // End of new work.
        // UI DISPLAY FUNCTIONS

        // display item on screen
        displayTest : function(item) {
                        // New code, delete if it doesn't work.
            var changeHeight = document.getElementById("itemdisplay");
            // End of new code.
                        $("#item-test").show();
            var displayText = PG.tools.addSimpleMarkup(item.itemText);

            // HvR/FS: Aangepast om plaatjes mogelijk te maken:
            if (displayText.search("\.png") > -1) {
            	displayText = "<img src=\"" + displayText + "\" width=" + flagWidth + " border=\"" + borderThickness + "\">";
            }
            $("#test-text").html(displayText);
        },


        displayStudy : function(item) {
                        // New code, delete if it doesn't work.
                        var changeHeight = document.getElementById("itemdisplay");
            // End of new code.
            $("#item-study").show();

            var displayText = PG.tools.addSimpleMarkup(item.itemText);

            // HvR/FS: Aangepast om plaatjes mogelijk te maken:
            if (displayText.search("\.png") > -1) {
            	displayText = "<img src=\"" + displayText + "\" width=" + flagWidth + " border=\"" + borderThickness + "\">";
            }
            $("#study-text").html(displayText);
            var cue = "antwoord: ";  // Aangepast FS: changed to Dutch
            $("#study-answer-text").text(cue.concat(item.answer));
        },

        // Hint is a like a study trial, but then showing the hint instead of the answer
        displayHint : function(item) {
            var changeHeight = document.getElementById("itemdisplay");
            $("#item-study").show();
            var displayText = PG.tools.addSimpleMarkup(item.itemText);
            $("#study-text").html(displayText);
            var cue =  "Hint: ";
            $("#study-answer-text").text(cue.concat(item.hint));
        },

        displayFeedback : function(feedback) {
            $("#item").hide();
                        // new code. Delete if not working.
                        //var changeHeight = document.getElementById("itemdisplay");
                        //changeHeight.style.height = 400 + "px";
                        // End of new code.
            if (feedback.isCorrect == 1) {
                $("#feedback").removeClass().addClass('feedback-correct');
            }
            else if (feedback.isCorrect == 2) {
                $("#feedback").removeClass().addClass('feedback-almost-correct');
            }
            else {
                $("#feedback").removeClass().addClass('feedback-incorrect');
            }

            $("#feedback").show();
            $("#feedback").text(feedback.msg);
                        // New code, delete if it doesn't work
                        var answerText = "";

            // If this is a multiple choice item, use answerMC, otherwise just answer:
            if(feedback.item.answer.indexOf("~")!=-1){
                answerText = feedback.item.answer.split("~")[0];
            } else {
                answerText = feedback.item.answer;
            }
                        // Delete if it doesn't work.
            if (feedback.isCorrect != 1) {

                // HvR/FS: Aangepast om plaatjes mogelijk te maken:
                if (feedback.item.itemText.search(".png") > -1) {
	                if ((TXT_ANSWER_WAS1 + TXT_ANSWER_WAS2).length > 0) {
    	                var message = "<img src=\"" + PG.tools.htmlEncode(feedback.item.itemText) + "\" width=" + flagWidth + " border=\"" + borderThickness + "\">&nbsp;<p>" + TXT_ANSWER_WAS1+' <b>'+PG.tools.htmlEncode(answerText)+'</b><p>';
        	            $("#feedback-message").show();
            	        // original was: $("#feedback-message").html(TXT_ANSWER_WAS+' <b>'+PG.tools.htmlEncode(feedback.item.answer)+'</b>');
                	    $("#feedback-message").html(message);
                	}

                } else {
	                if ((TXT_ANSWER_WAS1 + TXT_ANSWER_WAS2).length > 0) {
    	                var message = TXT_ANSWER_WAS1+' <b>'+PG.tools.htmlEncode(feedback.item.itemText)+'</b> '+TXT_ANSWER_WAS2+' <b>'+PG.tools.htmlEncode(answerText)+'</b>';
        	            $("#feedback-message").show();
            	        // original was: $("#feedback-message").html(TXT_ANSWER_WAS+' <b>'+PG.tools.htmlEncode(feedback.item.answer)+'</b>');
                	    $("#feedback-message").html(message);
                	}
                }
            }

        },

        // update the score display
        updateScore : function() {
            // calculate number of correct responses
            var numResults = this.scoreCountTrials.length;
            var start = Math.max(numResults - this.numScoreCount, 0);
            var numTrials = Math.min(this.numScoreCount, numResults);
            var total = 0;

            // sum results
            for (var i=start; i<numResults; i++) {
                total += this.scoreCountTrials[i];
            }

            // get percentage
            var percentage = (total / numTrials)*100;

            // display
            $("#study-session-results").text(TXT_SCORE_IS+' '+total+'/'+numTrials+' ('+percentage.toFixed(2)+'%). '+
                                             this.model.getNumActiveItems()+'/'+this.model.getNumTotalItems()+' '+TXT_ITEMS_SEEN+'.');
        },

        // update the clock display
        updateClock : function() {
            var elapsed = that.getTotalElapsedTime();
            var totalSeconds = Math.floor(elapsed/1000);
            var totalMinutes = Math.floor(totalSeconds/60);
            var totalHours   = Math.floor(totalMinutes/60);

            // get hours
            var hours = totalHours;
            if (hours < 10) {
                hours = '0'+hours;
            }
            // get minutes
            var minutes = totalMinutes - totalHours*60;
            if (minutes < 10) {
                minutes = '0'+minutes;
            }
            // get seconds
            var seconds = totalSeconds - totalMinutes*60;
            if (seconds < 10) {
                seconds = '0'+seconds;
            }

            var maxMinutes = this.studySessionLength;
            if (maxMinutes < 10) {
                maxMinutes = '0'+maxMinutes;
            }

            // display time
            $("#study-timer").text(hours+':'+minutes+':'+seconds+' / 00:'+maxMinutes+':00');

            if (this.rememberTime) {
                // update stop link
                if (this.expEnv) {
                    $('#stop-session').attr('href', 'exp/index/stime/'+elapsed);
                }
                else {
                    $('#stop-session').attr('href', 'site/index/stime/'+elapsed);
                }
            }
        }
    };

    // the base class for all study models
    // it simply iterates through the whole item list
    PG.studyModel = {
        // standard item list
        items : [],
        // duration of a test event
        testDuration : 5000,
        studyDuration : 3000,
        // duration of the feedback event
        correctFeedbackDuration: 600,
        incorrectFeedbackDuration: 4000,
        elapsedTime : 0,
        prevElapsedTime : 0,
        // lists the items belong to
        listIds : 0,
        // the index of the item used in the current event (-1 for non-item events)
        currentItemIdx : -1,
        currentEventType : 'none',
        modelName : 'default',
        // total number of events sofar
        eventCount : 0,
        // 'constant' representing no feedback
        noFeedback : null,
        // activate the autocomplete functionality in the ui, per list
        allowAutoComplete : {},
        // the maximal error distance, per list
        maxErrorDistance : {},
        // number of items presented at least once
        numActiveItems : 0,

        // initialize the model parameters
        init : function (newItems, autoComp, errorDist, sessLen) {
            this.setItems(newItems);
            this.allowAutoComplete = autoComp;
            this.maxErrorDistance = errorDist;
        },

        // overwrite items array with new items
        setItems : function (newItems) {
            this.items = newItems;
            //console.log(this.items);
        },

        // get the next (item) event based on the model logic
        getNextEvent : function (sessionDuration) {
            this.currentItemIdx = (this.currentItemIdx+1) % this.items.length;
            this.eventCount += 1;

            return this.newStudyEvent(this.items[this.currentItemIdx]);
        },

        saveEvent : function (response, isCorrect, RT, duration, pars) {
            PG.global.saveEvent(this.items[this.currentItemIdx].listId, this.items[this.currentItemIdx].id,
                                response, isCorrect, RT, duration, this.currentEventType, this.modelName,
                                this.eventCount, pars);
        },

        // save persistent item data
        saveItemData : function (pars) {
            var updateTime = PG.tools.getTimeStamp();
            PG.global.saveItemData(this.items[this.currentItemIdx].id, this.modelName,
                                   this.items[this.currentItemIdx].numPresentations, updateTime, pars);
        },

        // analyze the response, update the model, and determine the feedback (if any)
        processResponse : function (response, RT, trialDuration, sessionDuration, savePersistent) {
            var isCorrect = (response.toLowerCase() === this.items[this.currentItemIdx].answer.toLowerCase());

                        // Delete if this code doesn't work:
                        // If this is a multiple choice item, overwrite isCorrect using answerMC:
            if(this.items[this.currentItemIdx].answer.indexOf("~")!=-1){
                isCorrect = (response.toLowerCase() === this.items[this.currentItemIdx].answerMC.toLowerCase());
            }
                        // End of new code

            this.prevElapsedTime = this.elapsedTime;
            this.elapsedTime = sessionDuration / 1000;
            // save result
            //var pars = PG.tools.encodeParameters('response', response);
            var pars = '';

            // handle feedback
            if (isCorrect) {
                return this.newCorrectFeedbackEvent(TXT_CORRECT);
            }
            else {
                return this.newIncorrectFeedbackEvent(TXT_INCORRECT);
            }
        },

        // get item i
        getItem : function (i) {
            return this.items[i];
        },

        // get the total number of items
        getNumItems : function () {
            return this.getNumTotalItems();
        },

        // check whether the list the current item belongs to allows autocomplete
        allowsAutoComplete : function () {
            //console.log(this.items[this.currentItemIdx].listId,this.allowAutoComplete[this.items[this.currentItemIdx].listId]);
            return this.allowAutoComplete[this.items[this.currentItemIdx].listId];
        },

        // EVENT ENCAPSULATION FUNCTIONS

        newCorrectFeedbackEvent : function (message) {
            return this.newResultEvent(1, true, this.currentItemIdx, this.correctFeedbackDuration, message);
        },

        newIncorrectFeedbackEvent : function (message) {
            return this.newResultEvent(0, true, this.currentItemIdx, this.incorrectFeedbackDuration, message);
        },

        newAlmostCorrectFeedbackEvent : function (message) {
            return this.newResultEvent(2, true, this.currentItemIdx, this.incorrectFeedbackDuration, message);
        },

        newCorrectEvent : function () {
            return this.newResultEvent(1, false, this.currentItemIdx, 0, '');
        },

        newIncorrectEvent : function () {
            return this.newResultEvent(0, false, this.currentItemIdx, 0, '');
        },

        newResultEvent : function (correct, show, itemIdx, dur, message) {
            return {eventType : 'result',
                    showFeedback : show,
                    duration : dur,
                    e : {isCorrect : correct,
                         item      : this.items[itemIdx],
                         msg       : message
                        }
            };
        },

        // encapsulation for test events
        newTestEvent : function (item) {
            this.currentEventType = 'test';
            return {eventType : 'test',
                    duration  : this.testDuration,
                    e         : item
            };
        },

        // encapsulation for study events
        newStudyEvent : function (item) {
            this.currentEventType = 'study';
            return {eventType : 'study',
                    duration  : this.studyDuration,
                    e         : item
            };
        },

        // event sent to stop the session
        stopSessionEvent : function () {
            return {eventType : 'stop'};
        },

        // total number of items
        getNumTotalItems : function () {
            return this.items.length;
        },

        // number of active items
        getNumActiveItems : function () {
            return this.numActiveItems;
        },

        // sometimes items are presented far too often.
        // Allow users to slighty 'adjust' the presentation rate of such items
        // if no item id is provided, the function will return whether this
        // functionality is supported by the model
        makeItemAppearLess : function (perform) {
            return false;
        }
    };

    // Functions that might be useful to the study scheduling model
    PG.tools = {

        seed : 1,

        // encode additional parameters a model wants to store into a string
        // use as: encodeParameters('par1', value1, 'par2', value2, ...)
        encodeParameters : function () {
            var i;
            var parStr = '';

            if (arguments.length % 2 == 0) {
                for(i=0; i<arguments.length; i+=2) {
                    parStr += '"'+arguments[i]+'":"'+this.addslashes(arguments[i+1]+'')+'"';
                    if (i+2 < arguments.length)
                      parStr += ',';
                }
                //console.log(parStr);
                return parStr;
            }
            else {
                return null;
            }
        },
        // decode the additional parameters into an object
        decodeParameters : function (paramString) {
            var params = paramString.split('##');
            var parArr = [];
            for (var i=0; i<params.length; ++i) {
                var val = params[i].split('||');
                parArr[val[0]] = val[1];
            }

            return parArr;
        },

        // compute the regular Levensthein distance
        levenshtein : function (str1, str2) {
            var l1 = str1.length, l2 = str2.length;
            if (Math.min(l1, l2) === 0) {
                return Math.max(l1, l2);
            }

            var i = 0, j = 0, d = [];

            for (i=0 ; i<=l1 ; i++) {
                d[i] = [];
                d[i][0] = i;
            }

            for (j=0 ; j<=l2 ; j++) {
                d[0][j] = j;
            }

            for (i=1 ; i<=l1 ; i++) {
                for (j=1 ; j<=l2 ; j++) {
                    d[i][j] = Math.min( d[i-1][j] + 1, d[i][j-1] + 1,
                                        d[i-1][j-1] + (str1.charAt(i-1) === str2.charAt(j-1) ? 0 : 1)
                    );
                }
            }
            return d[l1][l2];
        },

        // Damerau-Levensthein distance: also accounts for transposition of 2 chars
        damerauLevenshtein : function (a, b) {
            var i, j, cost;
            var d = [];

            if (a.length == 0) {
                return b.length;
            }

            if (b.length == 0) {
                return a.length;
            }

            for (i=0; i<=a.length; i++) {
                d[i] = [];
                d[i][0] = i;
            }

            for (j=0; j<=b.length; j++) {
                d[0][j] = j;
            }

            for (i=1; i<=a.length; i++) {
                for ( j = 1; j <= b.length; j++ ) {
                    if (a.charAt(i-1) == b.charAt(j-1)) {
                        cost = 0;
                    }
                    else {
                        cost = 1;
                    }

                    d[i][j] = Math.min( d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost );

                    if(i > 1 && j > 1 &&  a.charAt(i-1) == b.charAt(j-2) &&
                       a.charAt(i-2) == b.charAt(j-1) ) {

                        d[i][j] = Math.min( d[i][j], d[i - 2][j - 2] + cost)

                    }
                }
            }
            return d[a.length][b.length];
        },

        // seed-based random generator, based on PeterAllenWebb (StackOverflow)
        random : function() {
            var x = Math.sin(this.seed++) * 10000;
            return x - Math.floor(x);
        },

        // randomize the order of an array
        shuffleItems : function(v) {
            for(var j, x, i = v.length; i; j = parseInt(this.random() * i), x = v[--i], v[i] = v[j], v[j] = x);
            return v;
        },

        // count the number of words in a sentence
        wordCount : function(sentence) {
            var words = sentence.split(' ');
            return words.length;
        },

        // count the number of characters in a sentence
        charCount : function(sentence) {
            return sentence.length;
        },

        // get the current unix timestamp
        getTimeStamp : function() {
            return Math.round(new Date().getTime() / 1000);
        },

        // round float x to n decimals
        round : function(x, n) {
            var factor = Math.pow(10, n);
            return Math.round(x*factor)/factor;
        },

        addslashes : function (strin) {
            return strin.replace(/\\/g, '\\\\').
                replace(/\u0008/g, '\\b').
                replace(/\t/g, '\\t').
                replace(/\n/g, '\\n').
                replace(/\f/g, '\\f').
                replace(/\r/g, '\\r').
                replace(/"/g, '\\"');
        },

        htmlEncode : function (s) {
            return s.replace(/&(?!\w+([;\s]|$))/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },

        addSimpleMarkup : function (s) {
            var s2 = s.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            s2 = s2.replace(/\_\_(.*?)\_\_/g, '<u>$1</u>');
            s2 = s2.replace(/\~\~(.*?)\~\~/g, '<i>$1</i>');

            return s2;
        }

    };

    // set UI event handlers
    $('#response').submit(function(e) {
        e.preventDefault();
        if (PG.global.allowInput) {
            PG.global.allowInput = false;

            PG.global.handleResponse();
        }
        return false;
    });

    $('#start-study').submit(function(e) {
        e.preventDefault();
        $('#start-study').hide();
        $('#response').show();
        $('[name=response]').focus();

        // position suggestion box right below the response input
        var pos = $('[name=response]').offset();
        var height = $('[name=response]').height();
        $('.complete').css({'left': (pos.left)+'px', 'top':(pos.top+height*1.5)+'px'});

        // setup auto complete box
        $('.complete').width($('[name=response]').width()+2);

        PG.global.start();
        return false;
    });

    $('#reduce-item-presentations').click(function(e) {
        e.preventDefault();

        PG.global.reducePresentationRate();
        return false;
    });

    $('[name=response]').keypress(function (e) {
        PG.global.keyPressed(e);
    });

    $('[name=response]').keydown(function (e) {
        PG.global.keyDown(e);
    });

    $('[name=response]').keyup(function (e) {
        PG.global.autoComplete(e);
    });

    $('#stop-session').click(function() {
        PG.global.stopSession();
    });

    // clicking the suggestion loads in into the response input
    $('.complete').click(function () {
        $('[name=response]').val(PG.global.autoCompleteMatch);
        $('.complete').attr('id', 'autocomplete-selected');
        $('[name=response]').focus();
    });

    $('.complete').hide();

    // select response box
    $('[name=response]').focus();

}); // $(document)
