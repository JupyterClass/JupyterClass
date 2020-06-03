const CONFIG = {
  studentStatusEndpoint: 'https://hw-live-db.herokuapp.com/student/practice/status',
  studentAttemptEvalEndpoint: 'https://hw-live-db.herokuapp.com/student/practice/question/eval',

  // If question output is deemed to be at least 50% "correct"
  correctnessThreshold: 0.5
};

define([
  'base/js/namespace'
], function (
  Jupyter,
) {

  function load_ipython_extension() {
    // TODO: Notebook metadata needs to store three of the following variables
    //       to identify a student's attempt for a given question for a given practice

    const {studentId, practiceId} = getJupyterClassInfo();

    if (!studentId || !practiceId) {
      // Not a JupyterClass notebook.
      return;
    }

    console.log("🚀 Welcome to lesson " + practiceId + " " + studentId + "!");

    addJupyterClassButtonToToolbar();

    // Attach callback to all Practice Question code cells
    let questionCells = getQuestionCells();

    questionCells.forEach(questionCell => {
      patch_CodeCell_get_callbacks(questionCell, postRunCellCallback);
    });
  }

  function addJupyterClassButtonToToolbar() {

    let handler = function () {
      document.getElementById('jc-modal').style.display = 'flex'; // default is 'none'
    };

    const modal = `
      <div id="jc-modal" style="display: none; position: fixed; top: 0; bottom: 0; left: 0; right: 0; height: 100%; width: 100%; background-color: rgba(0,0,0,0.7); z-index: 100; justify-content: center; align-items: center;" class="">
        <div style="position: relative;">
          <div id="jc-form" style="display: flex; flex-direction: column; background-color: white; min-width: 300px; min-height: 300px; border-radius: 4px; padding: 16px;">
            <h1 style="font-size: 3em; margin-bottom: 16px;">
              JupyterClass
            </h1>
            <code>Author: @elihuansen</code>
            <input id="jc-student-name" style="margin: 16px 0 8px 0" class="form-control" placeholder="Student Full Name">
            <input id="jc-secret" class="form-control" placeholder="Lesson Password">
            <button class="btn btn-primary" style="width: 100%; margin-top: auto;">
              SUBMIT
            </button>
          </div>
          <span style="position: absolute; top: 5px; right: 5px; cursor: pointer;" 
                onclick="document.getElementById('jc-modal').style.display = 'none';">
            X
          </span>
        </div>
      </div>
    `.trim();
    const body = document.getElementsByTagName('body')[0];
    body.insertAdjacentHTML('beforeend', modal);

    // Prevent key presses from calling jupyter notebook's keyboard shortcuts
    document.getElementById('jc-student-name').onkeydown = function (e) { e.stopPropagation(); };
    document.getElementById('jc-secret').onkeydown = function (e) { e.stopPropagation(); };

    let action = {
      icon: 'fa-graduation-cap', // a font-awesome class used on buttons, etc
      help: 'Show JupyterClass modal',
      help_index: 'zz',
      handler
    };
    let prefix = 'JupyterClass';
    let action_name = 'show-alert';

    let full_action_name = Jupyter.actions.register(action, action_name, prefix); // returns 'my_extension:show-alert'
    Jupyter.toolbar.add_buttons_group([full_action_name]);
  }

  function similarity(s1, s2) {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength === 0) {
      return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
  }

  function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    let costs = [];

    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }
    return costs[s2.length];
  }

  function postData(url = '', data = {}) {
    // Default options are marked with *
    return fetch(url, {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      mode: 'cors', // no-cors, cors, *same-origin
      cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
      credentials: 'same-origin', // include, *same-origin, omit
      headers: {
        'Content-Type': 'application/json',
      },
      redirect: 'follow', // manual, *follow, error
      referrer: 'no-referrer', // no-referrer, *client
      body: JSON.stringify(data), // body data type must match "Content-Type" header
    })
      .then(response => response.json()); // parses JSON response into native JavaScript objects
  }

  function getJupyterClassInfo() {
    return Jupyter.notebook.metadata.JupyterClass;
  }

  function getStudentPracticeInfo() {
    const {studentId, practiceId} = getJupyterClassInfo();
    return {studentId, practiceId};
  }

  function notifyStudentQuestionCorrect(questionId) {

    const endpoint = CONFIG.studentStatusEndpoint;
    const {studentId, practiceId} = getStudentPracticeInfo();

    const requestBody = {
      studentId, practiceId, questionId,
      status: 'correct'
    };
    console.log(requestBody);
    postData(endpoint, requestBody)
      .then(console.log)
      .catch(err => {
        console.log(err);
      });
  }

  function apiEvalStudentAttempt({questionId, output}) {
    const endpoint = CONFIG.studentAttemptEvalEndpoint;
    const {studentId, practiceId} = getStudentPracticeInfo();

    const requestBody = {studentId, practiceId, questionId, output};

    console.log(requestBody);
    postData(endpoint, requestBody)
      .then(console.log)
      .catch(err => {
        console.log(err);
      });
  }

  function getCorrectnessScore(expectedOutput, actualOutput) {
    return similarity(expectedOutput, actualOutput);
  }

  function getQuestionCells() {
    return Jupyter
      .notebook.get_cells()
      .filter(cell => cell._metadata.Question != null);
  }

  function cleanCellOutput(output) {
    // Assume output is string
    let firstChar, lastChar;

    firstChar = output[0];
    lastChar = output[output.length - 1];

    if (
      (firstChar === '"' || firstChar === "'") &&
      (lastChar === '"' || lastChar === "'")
    ) {
      output = output.substring(1, output.length - 1);
    }

    return output;
  }

  function postRunCellCallback(codeCell) {
    // Code to run after a code cell finishes running

    let question, questionId, expectedOutput;
    let output, outputType, outputValue;
    let correctnessScore;

    if (codeCell.output_area.outputs.length == 0) {
      return false;
    }

    question = codeCell._metadata.Question;
    questionId = question.id;
    expectedOutput = question.expected;

    output = codeCell.output_area.outputs[0];
    outputType = output.output_type;

    if (outputType == 'execute_result' || outputType == 'display_data') {
      outputValue = output.data['text/plain'];
    } else if (outputType == 'stream') {
      outputValue = output.text;
    }

    outputValue = cleanCellOutput(outputValue);

    correctnessScore = getCorrectnessScore(expectedOutput, outputValue);
    console.log('Frontend evaluated correctness: 🎉', correctnessScore);

    if (correctnessScore > CONFIG.correctnessThreshold) {
      apiEvalStudentAttempt({questionId: question.id, output: outputValue});
    }
  }

  function patch_CodeCell_get_callbacks(codeCell, callback) {

    let old_get_callbacks = codeCell.get_callbacks;

    // Essentially a wrapper for get_callbacks
    codeCell.get_callbacks = function () {
      let callbacks = old_get_callbacks.apply(this, arguments);

      let prev_reply_callback = callbacks.shell.reply;
      callbacks.shell.reply = function (msg) {
        if (msg.msg_type === 'execute_reply') {
          try {
            callback(codeCell);
          } catch (error) {
            console.error('[JupyterClass]', error);
          }
        } else {
          console.log('msg_type', msg.msg_type);
        }
        return prev_reply_callback(msg);
      };
      return callbacks;
    };
  }

  return {load_ipython_extension};

});