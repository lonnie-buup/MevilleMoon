from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
KERNEL_DIR = ROOT / "Data" / "SPICE"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
KERNELS = {
    "naif0012.tls": f"{NAIF}/lsk/naif0012.tls",
    "pck00011.tpc": f"{NAIF}/pck/pck00011.tpc",
    "moon_pa_de440_200625.bpc": f"{NAIF}/pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": f"{NAIF}/fk/satellites/moon_de440_250416.tf",
    "de440s.bsp": f"{NAIF}/spk/planets/de440s.bsp",
}


def download_kernel(name: str, url: str) -> None:
    destination = KERNEL_DIR / name
    if destination.exists() and destination.stat().st_size:
        print(f"Ya existe: {name}")
        return

    temporary = destination.with_suffix(destination.suffix + ".part")
    print(f"Descargando {name}...")
    try:
        with urlopen(url, timeout=60) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if not temporary.stat().st_size:
            raise RuntimeError(f"NAIF devolvió un archivo vacío para {name}.")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    KERNEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in KERNELS.items():
        download_kernel(name, url)
    print(f"Kernels instalados en: {KERNEL_DIR}")


if __name__ == "__main__":
    main()
