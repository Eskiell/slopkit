import importlib.util
import pathlib
import tempfile
import unittest


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
ADAPTER_PATH = PROJECT_ROOT / "host-local.py"


def load_adapter():
    if not ADAPTER_PATH.exists():
        raise AssertionError("host-local.py deve existir")
    spec = importlib.util.spec_from_file_location("host_local", ADAPTER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HostLocalTest(unittest.TestCase):
    def test_desativa_frontend_embutido_e_repassa_argumentos(self):
        adapter = load_adapter()

        with tempfile.TemporaryDirectory() as directory:
            fake_host = pathlib.Path(directory) / "host.py"
            fake_host.write_text(
                "def get_embedded_zip():\n"
                "    return 'frontend-embutido'\n"
                "\n"
                "def main(argv=None):\n"
                "    return (get_embedded_zip(), argv)\n",
                encoding="utf-8",
            )

            result = adapter.run_host(fake_host, ["--base", "/projeto"])

        self.assertEqual(result, (None, ["--base", "/projeto"]))


if __name__ == "__main__":
    unittest.main()
