"""
cfx_editor.py — abre, modifica y guarda archivos .cfx (Custom Project SQX).

Un .cfx es un ZIP que contiene:
  - config.xml (master: lista de Tasks + Databanks)
  - Build-Task*.xml, Retest-Task*.xml, AutomaticRetest-Task*.xml (configs por task)

Esta clase carga TODO el contenido en memoria, permite editar XMLs como ElementTree
y reempaqueta a un .cfx nuevo. Preserva timestamps de las entries originales.
"""
from __future__ import annotations

import io
import os
import zipfile
from typing import Dict, Iterator, Optional, Tuple
from xml.etree import ElementTree as ET


class CfxEditor:
    """Editor in-memory para archivos .cfx (Custom Project SQX)."""

    def __init__(self, src_path: str) -> None:
        if not os.path.isfile(src_path):
            raise FileNotFoundError(f"CFX source not found: {src_path}")
        self.src_path = src_path
        # Diccionario {filename: bytes} con todo el contenido del ZIP
        self._files: Dict[str, bytes] = {}
        # Diccionario {filename: ZipInfo} para preservar metadatos
        self._infos: Dict[str, zipfile.ZipInfo] = {}
        # Cache de XMLs parseados {filename: ElementTree}
        self._xml_cache: Dict[str, ET.ElementTree] = {}
        self._load()

    def _load(self) -> None:
        with zipfile.ZipFile(self.src_path, "r") as z:
            for info in z.infolist():
                self._infos[info.filename] = info
                self._files[info.filename] = z.read(info.filename)

    # ── Read ──────────────────────────────────────────────────────
    def list_files(self) -> list[str]:
        return list(self._files.keys())

    def has(self, filename: str) -> bool:
        return filename in self._files

    def read_bytes(self, filename: str) -> bytes:
        return self._files[filename]

    def read_text(self, filename: str, encoding: str = "utf-8") -> str:
        return self._files[filename].decode(encoding)

    def parse_xml(self, filename: str) -> ET.ElementTree:
        """Parsea un XML del .cfx y lo cachea. Devuelve el ElementTree."""
        if filename in self._xml_cache:
            return self._xml_cache[filename]
        tree = ET.ElementTree(ET.fromstring(self.read_text(filename)))
        self._xml_cache[filename] = tree
        return tree

    def get_root(self, filename: str) -> ET.Element:
        return self.parse_xml(filename).getroot()

    def iter_xml_files(self) -> Iterator[Tuple[str, ET.ElementTree]]:
        """Itera sobre los .xml del .cfx. Útil para aplicar patches a todos."""
        for fn in self._files:
            if fn.lower().endswith(".xml"):
                yield fn, self.parse_xml(fn)

    # ── Write ─────────────────────────────────────────────────────
    def update_text(self, filename: str, content: str, encoding: str = "utf-8") -> None:
        self._files[filename] = content.encode(encoding)
        self._xml_cache.pop(filename, None)

    def update_xml(self, filename: str, tree: ET.ElementTree) -> None:
        """Serializa el ET y reemplaza el contenido del archivo en memoria."""
        buf = io.BytesIO()
        tree.write(buf, encoding="utf-8", xml_declaration=False)
        self._files[filename] = buf.getvalue()
        self._xml_cache[filename] = tree

    def commit_cached_xmls(self) -> None:
        """Re-serializa todos los XMLs cacheados al buffer de bytes."""
        for fn, tree in list(self._xml_cache.items()):
            buf = io.BytesIO()
            tree.write(buf, encoding="utf-8", xml_declaration=False)
            self._files[fn] = buf.getvalue()

    def save(self, dst_path: str, overwrite: bool = True) -> str:
        """Empaqueta todo a un .cfx en dst_path. Devuelve el path final."""
        if os.path.isfile(dst_path) and not overwrite:
            raise FileExistsError(dst_path)
        os.makedirs(os.path.dirname(os.path.abspath(dst_path)) or ".", exist_ok=True)
        # Re-serializar XMLs cacheados antes de empaquetar
        self.commit_cached_xmls()
        with zipfile.ZipFile(dst_path, "w", zipfile.ZIP_DEFLATED) as z:
            for filename, data in self._files.items():
                # Preserva timestamp si existe
                info = self._infos.get(filename)
                if info is not None:
                    new_info = zipfile.ZipInfo(filename=filename, date_time=info.date_time)
                    new_info.compress_type = zipfile.ZIP_DEFLATED
                    new_info.external_attr = info.external_attr
                    z.writestr(new_info, data)
                else:
                    z.writestr(filename, data)
        return dst_path

    # ── Convenience ───────────────────────────────────────────────
    def __repr__(self) -> str:
        return f"CfxEditor({self.src_path!r}, {len(self._files)} files)"
