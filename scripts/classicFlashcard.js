/*
 The classic flashcard control condition: Items are grouped in batches of 5.
 Once each item in a batch has been recalled correctly once, the next batch is loaded.
 When all batches have been presented, start anew from the first batch.
 
*/


// execute script when the whole page has been loaded
$(document).ready(function(){
   
    // set up the js namespace (PG), although it should already be defined
    if (typeof PG == "undefined") PG = {};

    // ### DEFINE MODEL: ADD CHANGES HERE

    // extend PG.studyModel. The new name must be the same as the module (and .js) name
    PG.classicFlashcard = Object.create(PG.studyModel);

    // ### override variables of PG.studyModel
    
    // define the current 'condition' of the model, e.g. 'control'
    PG.classicFlashcard.modelName = 'flashcard';

    // ### define (extra) model variables
    
    // elapsed session time
    PG.classicFlashcard.elapsedTime = 0;
    
    // session length in miliseconds
    PG.classicFlashcard.sessionLength = 25*60*1000;
    
    PG.classicFlashcard.studyDuration = 17*1000;
    PG.classicFlashcard.testDuration = 17*1000;
    
    // size of each flashcard batch
    PG.classicFlashcard.batchSize = 5;
    
    // container for the current batch being studied
    PG.classicFlashcard.currentBatch = [];
    
    // number of the current batch
    PG.classicFlashcard.currentBatchNum = 0;
    
    // position within the current batch
    PG.classicFlashcard.currentBatchPos = -1;

    PG.classicFlashcard.debug = false;
    // ### override functions of PG.studyModel

    // override PG.studyModel.init
    PG.classicFlashcard.init = function (newItems, autoComp, errorDist, sessLen) {
        this.sessionLength = sessLen*60*1000;
		// 60 was originally 17: to reflect the duration of the exam.
        this.studyDuration = 60*1000;
        this.testDuration = 60*1000;
        this.correctFeedbackDuration = 600;
        this.incorrectFeedbackDuration = 4000;
        
        this.allowAutoComplete = autoComp;
        this.maxErrorDistance = errorDist;

        this.setItems(newItems);
        this.loadBatch(this.currentBatchNum);
    };    
    
    
    // override PG.studyModel.setItems
    PG.classicFlashcard.setItems = function (newItems) {
        // PG.tools is a collection of useful functions, such as shuffle and levenshtein
        // HvR: this.items = PG.tools.shuffleItems(newItems);
		this.items = newItems
        var n = this.items.length;

        while (n--) {
            // load persistent data if available
            if (this.items[n].persistent != null) {
                this.items[n].numPresentations = parseInt(this.items[n].persistent.presentations);
                if (this.debug) console.log('Persistent data loaded for item',this.items[n].id,', pres:',this.items[n].numPresentations);
            }
        }
        
    };
    
    // override PG.studyModel.getNextEvent
    PG.classicFlashcard.getNextEvent = function (sessionDuration) {
        // has the maximum study time passed?
        if (this.elapsedTime > this.sessionLength) {
            // end session
            return this.stopSessionEvent();
        }
        
        // check if the current batch is empty
        if (this.currentBatch.length == 0) {
            // select new batch
            this.currentBatchNum = (this.currentBatchNum+1) % Math.ceil(this.items.length/this.batchSize);
            this.loadBatch(this.currentBatchNum);
            this.currentBatchPos = 0;
        }
        else {
            this.currentBatchPos = (this.currentBatchPos+1) % this.currentBatch.length;
        }
        
        // get new item id
        this.currentItemIdx = this.currentBatch[this.currentBatchPos];
        
        if (this.debug) console.log('item: ', this.currentItemIdx,' batch: ', this.currentBatchNum, ' offset: ', this.currentBatchPos);
        
        this.eventCount += 1; // keep track of the total number of trials
        this.items[this.currentItemIdx].numPresentations += 1;
        
        if (this.items[this.currentItemIdx].numPresentations > 1) {
            // encapsulation function defined in PG.studyModel
            return this.newTestEvent(this.items[this.currentItemIdx]);
        }
        else {
            // show a study trial if the item has never been presented before
            this.numActiveItems += 1;
            return this.newStudyEvent(this.items[this.currentItemIdx]);
        }
    };

    // override PG.studyModel.processResponse
    PG.classicFlashcard.processResponse = function (response, RT, trialDuration, sessionDuration) {
        //var isCorrect = (response.toLowerCase() === this.items[this.currentItemId].answer.toLowerCase());
        this.elapsedTime = sessionDuration;
        
        // check the Damerau-Levenshtein distance
        var answer = this.items[this.currentItemIdx].answer.toLowerCase();
        var distance = PG.tools.damerauLevenshtein(response.toLowerCase(), answer);
    
        // determine max distance from answer length
        var maxDistance = 1;
        if (answer.length < 5) {
            maxDistance = 0;
        }
    
        // if the distance is within bounds, count it as correct
        isCorrect = (distance <= maxDistance) ? true : false;
    
        // remove item from batch in case of a 'correct' response
        if (isCorrect && this.items[this.currentItemIdx].numPresentations > 1) {
            this.currentBatch.remove(this.currentBatchPos);
        }
    
        // save result
        var pars = PG.tools.encodeParameters('response', response, 'time', (this.elapsedTime/1000), // extra values to be saved
                                             'levdist', distance, 'presentation', this.items[this.currentItemIdx].numPresentations);
        this.saveEvent(isCorrect, RT, pars);
        this.saveItemData(''); // no extra parameters to save
        
        // handle feedback
        if (distance == 0) {
            return this.newCorrectFeedbackEvent('Correct!');
        }
        else if (distance <= maxDistance) {
            return this.newAlmostCorrectFeedbackEvent('Almost Correct!');
        }
        else {
            return this.newIncorrectFeedbackEvent('Incorrect!');
        }
    };
        
    // ### define custom functions
    
    // load flashcard batch n
    PG.classicFlashcard.loadBatch = function (n) {
        var batch = [];
        var firstItem = n*this.batchSize;
        var lastItem = Math.min(this.items.length, firstItem+this.batchSize);
        
        for (var i=firstItem; i<lastItem; ++i) {
            batch.push(i);
        }

		// HvR: 
		this.currentBatch = batch;
        //this.currentBatch = PG.tools.shuffleItems(batch);    
        //this.currentBatch = this.items.slice(firstItem, lastItem);
    };

}); // $(document)
