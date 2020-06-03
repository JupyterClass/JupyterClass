# Install the notebook extension locally and enable it.
# IMPORTANT: During development, jupyter notebook must be restarted
#            for the extension's code changes to take effect!
jupyter nbextension install JupyterClass && \
jupyter nbextension enable JupyterClass/static/index && \
jupyter notebook ~/Desktop/Lesson\ 6C\ Datathon.ipynb;