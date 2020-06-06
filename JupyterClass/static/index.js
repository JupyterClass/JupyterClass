const CONFIG = {
  // If question output is deemed to be at least 50% "correct"
  correctnessThreshold: 0.5
};

define([
  'base/js/namespace'
], function (
  Jupyter,
) {

  function joinSession({ studentId, practiceId, secret }) {
    HELPERS.postData(joinSessionEndpoint, { studentId, practiceId, secret })
      .then(data => {
        // TODO: Show success notification
        logger.log(data);
      })
  }

  logger.log('Injecting JupyterClass code...');

  let studentId = Jupyter.notebook.metadata.JupyterClass.studentId;
  let practiceId = Jupyter.notebook.notebook_name;
  let serverUrl = Jupyter.notebook.metadata.JupyterClass.server;
  let token = Jupyter.notebook.metadata.JupyterClass.token;
  let joinSessionEndpoint = serverUrl + '/api/join';
  let studentAttemptEvalEndpoint = serverUrl + '/api/evaluate';

  if (studentId && practiceId && serverUrl && token) {
    logger.log('All session metadata present. Attempting connection to JupyterClass server...');
    joinSession({studentId, practiceId, secret: token});
  }

  logger.log('Initialised with metadata:', { studentId, practiceId, serverUrl, token });

  function load_ipython_extension() {
    if (!practiceId) {
      // Not a JupyterClass notebook.
      return;
    }

    addJupyterClassButtonToToolbar();

    // Attach callback to all Practice Question code cells
    let questionCells = getQuestionCells();

    questionCells.forEach(questionCell => {
      patch_CodeCell_get_callbacks(questionCell, postRunCellCallback);
    });

    logger.log("Initialised - Practice ID: " + practiceId + "...");
  }

  function addJupyterClassButtonToToolbar() {
    logger.log('Adding button to toolbar');

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
            <input id="jc-student-name" style="margin: 16px 0 8px 0" class="form-control" placeholder="Student Full Name" value="${studentId || ''}">
            <input id="jc-secret" class="form-control" placeholder="Lesson Password">
            <button id="jc-submit" class="btn btn-primary" style="width: 100%; margin-top: auto;">
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

    const studentNameInput = document.getElementById('jc-student-name');
    const secretInput = document.getElementById('jc-secret');

    // Prevent key presses from calling jupyter notebook's keyboard shortcuts
    studentNameInput.onkeydown = function (e) { e.stopPropagation(); };
    secretInput.onkeydown = function (e) { e.stopPropagation(); };
    document.getElementById('jc-submit').onclick = function (e) {
      const studentName = studentNameInput.value;
      const secret = secretInput.value;

      studentId = studentName;
      Jupyter.notebook.metadata.JupyterClass.studentId = studentName;

      joinSession({ studentId, practiceId, secret });
    };

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

  function apiEvalStudentAttempt({questionId, output}) {
    const endpoint = studentAttemptEvalEndpoint;

    const requestBody = {studentId, practiceId, questionId, output};

    logger.log(requestBody);
    HELPERS.postData(endpoint, requestBody)
      .then(logger.log)
      .catch(err => {
        logger.error(err);
      });
  }

  function getCorrectnessScore(expectedOutput, actualOutput) {
    return HELPERS.similarity(expectedOutput, actualOutput);
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

    if (codeCell.output_area.outputs.length === 0) {
      return false;
    }

    question = codeCell._metadata.Question;
    questionId = question.id;
    expectedOutput = question.expected;

    output = codeCell.output_area.outputs[0];
    outputType = output.output_type;

    if (outputType === 'execute_result' || outputType === 'display_data') {
      outputValue = output.data['text/plain'];
    } else if (outputType === 'stream') {
      outputValue = output.text;
    }

    logger.log('🐞', output);

    outputValue = cleanCellOutput(outputValue);

    correctnessScore = getCorrectnessScore(expectedOutput, outputValue);
    logger.log('Frontend evaluated correctness: 🎉', correctnessScore);

    if (correctnessScore > CONFIG.correctnessThreshold) {
      apiEvalStudentAttempt({questionId, output: outputValue});
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
            logger.error(error);
          }
        } else {
          logger.log('msg_type', msg.msg_type);
        }
        return prev_reply_callback(msg);
      };
      return callbacks;
    };
  }

  return {load_ipython_extension};

});

const HELPERS = {

  similarity(s1, s2) {
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
  return (longerLength - this.editDistance(longer, shorter)) / parseFloat(longerLength);
},

  editDistance(s1, s2) {
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
  },

  postData(url = '', data = {}) {
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
  },

};

const logger = {
  log(...args) {
    console.log('[🚀 JupyterClass]', ...args);
  },
  error(message, ...args) {
    console.error('[🚀 JupyterClass / ERROR] ' + message, ...args);
  }
};