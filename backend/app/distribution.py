"""跨文档编码分布对比统计的纯函数逻辑。

统计口径（与编码共现 / 说话人分析一致）：对每个「文档 × 编码」，先把该
编码名下全部半开区间 [start, end) 做归一化——合并互相重叠或首尾相接
（相邻）的区间，再给出：
  - char_count：归一化区间覆盖的字符总数（同一编码重叠标注不重复计数）；
  - segment_count：归一化后的区间段数（标注段数）；
  - coverage_rate：覆盖字符数 ÷ 文档长度；
  - first_segment：归一化后按文档位置的首个区间（含原文摘录），供前端
    点击单元格时切回该文档正文并定位。

本模块只做计算，不读取也不修改任何标注数据。
"""

from __future__ import annotations

from typing import Iterable

from .cooccurrence import build_code_intervals


def _rate(part: int, whole: int) -> float:
    return round(part / whole, 4) if whole else 0.0


def _entry(
    document: dict,
    code_id: int,
    intervals: dict[int, list[tuple[int, int]]],
) -> dict:
    content = document["content"]
    segs = intervals.get(code_id, [])
    char_count = sum(e - s for s, e in segs)
    first = segs[0] if segs else None
    return {
        "code_id": code_id,
        "char_count": char_count,
        "segment_count": len(segs),
        "coverage_rate": _rate(char_count, len(content)),
        "first_segment": (
            {"start": first[0], "end": first[1], "text": content[first[0] : first[1]]}
            if first is not None
            else None
        ),
    }


def compute_distribution(
    documents: Iterable[dict],
    codings_by_doc: dict[int, list[dict]],
    code_ids: list[int],
) -> list[dict]:
    """按文档汇总各编码的字符数、段数与占文档长度比例。

    文档按 (标题, id) 稳定排序：标题为主序，id 作为并列时的稳定次序。
    每个文档都会为每个参与统计的编码给出一条（可能全为 0 的）结果，
    并额外回传文档长度与原始标注总数，便于前端提示空文档。
    """
    result: list[dict] = []
    for doc in sorted(documents, key=lambda d: (d["title"], d["id"])):
        codings = codings_by_doc.get(doc["id"], [])
        intervals = build_code_intervals(codings)
        result.append(
            {
                "document_id": doc["id"],
                "title": doc["title"],
                "length": len(doc["content"]),
                "coding_count": len(codings),
                "empty": len(codings) == 0,
                "codes": [_entry(doc, cid, intervals) for cid in code_ids],
            }
        )
    return result
