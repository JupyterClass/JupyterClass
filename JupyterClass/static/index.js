define([
  'base/js/namespace'
], function (
  Jupyter,
) {

  const CONFIG = {
    // If question output is deemed to be at least 50% "correct"
    correctnessThreshold: 0.5
  };

  let studentId = Jupyter.notebook.metadata.JupyterClass.studentId;
  let practiceId = Jupyter.notebook.metadata.JupyterClass.practiceId || Jupyter.notebook.notebook_name.replace('.ipynb', '');
  let serverUrl = Jupyter.notebook.metadata.JupyterClass.server;
  let sessionPwd = Jupyter.notebook.metadata.JupyterClass.sessionPwd;
  let expiry = Jupyter.notebook.metadata.JupyterClass.expiry;
  let joinSessionEndpoint = serverUrl + '/api/join';
  let rejoinSessionEndpoint = serverUrl + '/api/rejoin';
  let studentAttemptEvalEndpoint = serverUrl + '/api/evaluate';

  function joinSession({ studentId, practiceId, sessionPwd }) {
    return HELPERS.postData(joinSessionEndpoint, { studentId, practiceId, sessionPwd })
  }

  function rejoinSession() {
    return HELPERS.postData(
      rejoinSessionEndpoint,
      { studentId, practiceId, sessionPwd },
      { authorization: 'bearer ' + AUTH.getTokenFromPersistentStorage() });
  }

  function handleSubmit(name) {
    studentId = name;
    // Jupyter.notebook.metadata.JupyterClass.studentId = name;
    joinSession({ studentId, practiceId, sessionPwd })
      .then(response => {
        if (response.status === 'success') {
          Notification.showJoinSessionSuccess();
          AUTH.saveTokenInPersistentStorage(response.token);
          patchCodecellsWithJupyterClass();
        } else {
          Notification.showDuplicateNameError();
        }
      });
  }

  function load_ipython_extension() {
    if (!practiceId) {
      // Not a JupyterClass notebook.
      return;
    }

    logger.log('Initialised with metadata:', { studentId, practiceId, serverUrl  });

    // Optional expiry field. If it's set, check that it's valid.
    if (expiry) {
      const { valid, reason, timestamp } = HELPERS.parseExpiry(expiry);
      if (valid) {
        logger.log('Replacing `expiry` with converted timestamp');
        expiry = timestamp;
        if (expiry < Date.now()) {
          AUTH.deleteTokenFromPersistentStorage();
          return;
        }
      } else {
        logger.error(reason);
        logger.log('Aborting setup due to malformed expiry field');
        return;
      }
    }

    if (practiceId && serverUrl && sessionPwd) {
      logger.log('All session metadata present. Attempting connection to JupyterClass server...');

      // addJupyterClassButtonToToolbar();
      logger.log(0);
      getPracticeStatus(practiceId)
        .then(response => {
          logger.log(1);
          if (response.status === 'live') {
            logger.log(2);
            if (AUTH.getTokenFromPersistentStorage()) {
              rejoinSession()
                .then(response => {
                  logger.log('REJOIN RESPONSE:', response)
                  if (response.status === 'success') {
                    patchCodecellsWithJupyterClass();
                    Notification.showJoinSessionSuccess();
                  } else {
                    Notification.showJoinSessionForm();
                  }
                });
            } else {
              Notification.showJoinSessionForm();
            }
          } else if (response.status === 'error') {
            logger.log('Status is error', response);
            // Unauthorized
            Notification.showJoinSessionForm();
          } else {
            logger.log("Practice isn't live. Aborting code injection.");
          }
        })
    }
  }

  function patchCodecellsWithJupyterClass() {
    let questionCells = getQuestionCells();
    questionCells.forEach(questionCell => {
      patch_CodeCell_get_callbacks(questionCell, postRunCellCallback);
    });
    logger.log("Initialised - Practice ID: " + practiceId + "...");
  }

  function getPracticeStatus(practiceId) {
    return HELPERS.apiGet(
      serverUrl + `/api/practice/status?id=${practiceId}`,
      {
        authorization: 'bearer ' + AUTH.getTokenFromPersistentStorage()
      });
  }

  function addJupyterClassButtonToToolbar() {
    logger.log('Adding button to toolbar');

    let handler = function () {
      document.getElementById('jc-modal').style.display = 'flex'; // default is 'none'
    };

    let closeModal = function () {
      document.getElementById('jc-modal').style.display = 'none';
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
            <button id="jc-submit" class="btn btn-primary" style="width: 100%; margin-top: auto;">
              SUBMIT
            </button>
          </div>
          <span id="jc-close-modal"
                style="position: absolute; top: 5px; right: 5px; cursor: pointer;">
            X
          </span>
        </div>
      </div>
    `.trim();
    const body = document.getElementsByTagName('body')[0];
    body.insertAdjacentHTML('beforeend', modal);

    const studentNameInput = document.getElementById('jc-student-name');
    const closeModalButton = document.getElementById('jc-close-modal');
    const submitButton = document.getElementById('jc-submit');

    studentNameInput.setAttribute('value', studentId);

    // Prevent key presses from calling jupyter notebook's keyboard shortcuts
    studentNameInput.onkeydown = function (e) { e.stopPropagation(); };
    closeModalButton.onclick = closeModal;
    submitButton.onclick = function (e) {
      const studentName = studentNameInput.value;

      studentId = studentName;
      // Jupyter.notebook.metadata.JupyterClass.studentId = studentName;

      joinSession({ studentId, practiceId, sessionPwd })
        .then(isSuccessful => {
          if (isSuccessful) {
            closeModal();
          }
        })
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
    const requestBody = {practiceId, questionId, output};

    let shouldSend = true;
    if (expiry) {
      shouldSend = Date.now() < expiry;
    }

    if (shouldSend) {
      HELPERS.postData(endpoint, requestBody, { authorization: 'bearer ' + AUTH.getTokenFromPersistentStorage() })
        .then(logger.log)
        .catch(err => {
          logger.error(err);
        });
    }
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

    outputValue = cleanCellOutput(outputValue);

    correctnessScore = getCorrectnessScore(expectedOutput, outputValue);
    // logger.log('Frontend evaluated correctness: 🎉', correctnessScore);

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

  const AUTH = {
    key: 'JC_auth_tkn',

    saveTokenInPersistentStorage(token) {
      window.localStorage[this.key] = token;
      logger.log('Saved token to local storage');
    },
    getTokenFromPersistentStorage() {
      return window.localStorage[this.key];
    },
    deleteTokenFromPersistentStorage() {
      delete window.localStorage[this.key];
    }
  }

  const Notification = {

    container: `
    <div id="jc-notif" style="
      position: fixed; 
      top: 20px; 
      right: 0; 
      background: #FFFFFF;
      padding: 16px; 
      box-shadow: -2px 2px 6px 1px rgba(0,0,0,0.2);
      border-radius: 4px;
      min-height: 80px;
      min-width: 200px;
      transition: all 0.25s;
      transform: translateX(100%);
      z-index: 1000;
    "></div>
  `,
    element: document.getElementById('jc-notif'),
    title: null,
    content: null,

    render() {
      const innerHTML = `
      <h1 id="jc-notif-title">${this.title}</h1>
      <div id="jc-content">
        ${this.content}
      </div>
    `;

      if (!this.element) {
        const body = document.getElementsByTagName('body')[0];
        body.insertAdjacentHTML('beforeend', this.container);
      }
      this.element = document.getElementById('jc-notif');
      this.element.innerHTML = innerHTML;
    },

    showDuplicateNameError() {
      this.title = 'Please try another name';
      this.content = JoinSessionForm.html;
      this.show();
      JoinSessionForm.registerEventListeners();
    },

    showJoinSessionSuccess() {
      this.title = 'Joined session successfully!';
      this.content = '';
      this.show(3000);
    },

    showJoinSessionForm() {
      this.title = 'Please join the session';
      this.content = JoinSessionForm.html;
      this.show();
      JoinSessionForm.registerEventListeners();
    },

    show(hideAfter) {
      this.render();
      setTimeout(() => {
        this.element.style.transform = 'translateX(0)';
        if (hideAfter) {
          setTimeout(() => {
            this.hide();
          }, hideAfter);
        }
      }, 100);
    },

    hide() {
      this.element.style.transform = 'translateX(100%)';
    }
  }

  const JoinSessionForm = {
    html: `
    <div>
      <input id="jc-notif-student-name" style="margin: 16px 0 8px 0" class="form-control" placeholder="Student Full Name">
      <button id="jc-notif-submit" class="btn btn-primary" style="width: 100%; margin-top: auto;">
        SUBMIT
      </button>
    </div>
  `,

    registerEventListeners() {
      const studentNameInput = document.getElementById('jc-notif-student-name');
      const submitBtn = document.getElementById('jc-notif-submit');
      studentNameInput.onkeydown = function (e) { e.stopPropagation(); };
      submitBtn.onclick = function() {
        handleSubmit(studentNameInput.value);
      }
    }
  }

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

    postData(url = '', data = {}, headers = {}) {
      // Default options are marked with *
      return fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors', // no-cors, cors, *same-origin
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        credentials: 'same-origin', // include, *same-origin, omit
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        redirect: 'follow', // manual, *follow, error
        referrer: 'no-referrer', // no-referrer, *client
        body: JSON.stringify(data), // body data type must match "Content-Type" header
      })
        .then(response => response.json()); // parses JSON response into native JavaScript objects
    },

    apiGet(url= '', headers = {}) {
      return fetch(url, { headers }).then(response => response.json());
    },

    parseExpiry(timestamp) {
      let valid, reason;
      if (!timestamp) {
        valid = false;
        reason = 'Timestamp provided was falsey';
      } else if (isNaN(timestamp)) {
        timestamp = Number(new Date(timestamp));
        if (isNaN(timestamp)) {
          valid = false;
          reason = 'Timestamp provided could not be converted into a valid unix timestamp';
        }
      }
      valid = timestamp > Date.now();
      reason = valid ? 'Timestamp parsed successfully' : 'Timestamp cannot be before current time';
      return { valid, reason, timestamp };
    }
  };

  const logger = {
    log(...args) {
      console.log('[🚀 JupyterClass]', ...args);
    },
    error(message, ...args) {
      console.error('[🚀 JupyterClass / ERROR] ' + message, ...args);
    }
  };

  return {load_ipython_extension};

});