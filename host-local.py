#!/usr/bin/env python3
"""Serve o SlopKit local usando o DNS e HTTPS do WebKit Autoloader.

Adaptação local: a distribuição v0.4.0 prioriza estritamente o frontend
embutido e ignora ``--base``. Este adaptador desativa somente esse arquivo
embutido para que o diretório informado em ``--base`` seja servido do disco.
"""

import importlib.util
import os
import pathlib
import sys


PROJECT_ROOT = pathlib.Path(__file__).resolve().parent
DEFAULT_HOST_SCRIPT = (
    PROJECT_ROOT.parents[2]
    / "Downloads"
    / "webkit-autoloader-host_v0.4.0.py"
)


def run_host(host_script, argv):
    spec = importlib.util.spec_from_file_location("webkit_autoloader_host", host_script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não foi possível carregar o host: {host_script}")

    host = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(host)
    host.get_embedded_zip = lambda: None
    return host.main(argv)


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if "--base" not in args:
        args.extend(("--base", os.fspath(PROJECT_ROOT)))

    host_script = pathlib.Path(
        os.environ.get("PS5_AUTOLOADER_HOST", DEFAULT_HOST_SCRIPT)
    )
    if not host_script.is_file():
        print(f"Host do autoloader não encontrado: {host_script}", file=sys.stderr)
        return 1

    return run_host(host_script, args)


if __name__ == "__main__":
    sys.exit(main())
