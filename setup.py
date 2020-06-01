import setuptools

setuptools.setup(
    name="JupyterClass",
    version="0.0.4",
    include_package_data=True,
    data_files=[
        # like `jupyter nbextension install --sys-prefix`
        ("share/jupyter/nbextensions/JupyterClass", [
            "JupyterClass/static/index.js",
        ]),
        # like `jupyter nbextension enable --sys-prefix`
        ("etc/jupyter/nbconfig/notebook.d", [
            "jupyter-config/nbconfig/notebook.d/JupyterClass.json"
        ]),
        # like `jupyter serverextension enable --sys-prefix`
        # ("etc/jupyter/jupyter_notebook_config.d", [
        #     "jupyter-config/jupyter_notebook_config.d/JupyterClass.json"
        # ])
    ],
    zip_safe=False
)