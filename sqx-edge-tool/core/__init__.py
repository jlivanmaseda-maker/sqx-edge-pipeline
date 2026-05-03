"""SQX Edge Tool — core modules."""
from .cfx_editor import CfxEditor
from .plan import PLAN, Mining, get as get_mining, all_minings
from .project_generator import generate_project
from .xml_patcher import (
    RETEST_PERIODS,
    apply_mining_to_xml,
    clean_external_paths,
    patch_dates,
    patch_direction,
    patch_swap,
    patch_symbol_tf_spread,
)

__all__ = [
    "CfxEditor",
    "Mining",
    "PLAN",
    "get_mining",
    "all_minings",
    "generate_project",
    "RETEST_PERIODS",
    "apply_mining_to_xml",
    "patch_symbol_tf_spread",
    "patch_swap",
    "patch_direction",
    "patch_dates",
    "clean_external_paths",
]
