"""Tổng hợp summary JSON của k6 (docs/load-test/*-summary.json) thành bảng
Markdown (in ra màn hình) + 2 biểu đồ PNG trong docs/load-test/.
    python load-tests/report.py
"""
import json
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "load-test"
LEVELS = [10, 50, 100, 200]
LEVEL_SECONDS = 60
SCENARIOS = [
    ("a1-devices-list-cache", "GET /devices (có cache)"),
    ("b-devices-list-nocache", "GET /devices (tắt cache)"),
    ("a2-devices-detail", "GET /devices/:id"),
    ("c-mixed-flow", "Luồng hỗn hợp"),
    ("a3-devices-list-cache-stress", "Stress GET /devices (có cache, không nghỉ)"),
    ("b2-devices-list-nocache-stress", "Stress GET /devices (tắt cache, không nghỉ)"),
]
# Bảng màu phân loại đã kiểm định (dataviz palette, slot 1→4), thứ tự cố định.
COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#2a78d6", "#eb6834"]
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def load(name):
    p = ROOT / f"{name}-summary.json"
    return json.loads(p.read_text(encoding="utf-8"))["metrics"] if p.exists() else None


def vals(m, key):
    return m[key]["values"] if key in m else None


def row(label, reqs, dur, failed, seconds=None):
    rps = reqs["count"] / seconds if seconds else reqs["rate"]
    return (
        f"| {label} | {reqs['count']:,} | {rps:.1f} | {dur['avg']:.1f} | {dur['med']:.1f} | "
        f"{dur['p(95)']:.1f} | {dur['p(99)']:.1f} | {dur['max']:.1f} | {failed['rate'] * 100:.2f}% |"
    )


HEADER = (
    "| Mức tải | Số request | Request/giây | TB (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Max (ms) | Lỗi |\n"
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|"
)

per_level = {}
for name, title in SCENARIOS:
    m = load(name)
    if not m:
        continue
    print(f"\n### {title}  (`{name}`)\n\n{HEADER}")
    per_level[name] = {}
    for lv in LEVELS:
        reqs, dur, failed = (vals(m, f"{k}{{level:{lv}}}") for k in ("http_reqs", "http_req_duration", "http_req_failed"))
        if reqs and dur:
            print(row(f"{lv} VU", reqs, dur, failed, LEVEL_SECONDS))
            per_level[name][lv] = (reqs["count"] / LEVEL_SECONDS, dur["avg"], dur["p(95)"])
    print(row("**Toàn bộ**", vals(m, "http_reqs"), vals(m, "http_req_duration"), vals(m, "http_req_failed")))
    if name == "c-mixed-flow":
        print("\nTheo từng bước:\n\n| Bước | TB (ms) | p95 (ms) | p99 (ms) | Lỗi |\n|---|---:|---:|---:|---:|")
        for step in ["list", "detail", "availability", "policies"]:
            d, f = vals(m, f"http_req_duration{{step:{step}}}"), vals(m, f"http_req_failed{{step:{step}}}")
            print(f"| {step} | {d['avg']:.1f} | {d['p(95)']:.1f} | {d['p(99)']:.1f} | {f['rate'] * 100:.2f}% |")

race = load("d-booking-race")
if race:
    print("\n### Đặt thuê đồng thời\n")
    for k in ["booking_201", "booking_409", "booking_other_status"]:
        v = vals(race, k)
        print(f"- {k}: {v['count'] if v else 0}")
    d = vals(race, "http_req_duration{name:POST /bookings}")
    print(f"- POST /bookings: TB {d['avg']:.1f} ms, trung vị {d['med']:.1f}, p95 {d['p(95)']:.1f}, p99 {d['p(99)']:.1f}, max {d['max']:.1f}")
    for r in range(10):
        dr, cr = vals(race, f"http_req_duration{{round:{r},name:POST /bookings}}"), vals(race, f"booking_201{{round:{r}}}")
        if dr:
            print(f"  - vòng {r}: 201 = {cr['count'] if cr else 0}, TB {dr['avg']:.1f} ms, max {dr['max']:.1f} ms")


def style(ax, ylabel):
    ax.set_ylabel(ylabel, color=MUTED)
    ax.set_xlabel("Số người dùng ảo đồng thời (VU)", color=MUTED)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for s in ["top", "right"]:
        ax.spines[s].set_visible(False)
    for s in ["left", "bottom"]:
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=MUTED)


SHORT = {"a3-devices-list-cache-stress": "Có cache Redis", "b2-devices-list-nocache-stress": "Tắt cache"}


def grouped(names, metric_idx, title, ylabel, target, target_label, filename, fmt):
    names = [n for n in names if n in per_level]
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=150)
    width = 0.8 / len(names)
    for i, n in enumerate(names):
        label = SHORT.get(n, dict(SCENARIOS)[n])
        xs = [j + (i - (len(names) - 1) / 2) * width for j in range(len(LEVELS))]
        ys = [per_level[n].get(lv, (0, 0, 0))[metric_idx] for lv in LEVELS]
        bars = ax.bar(xs, ys, width * 0.92, color=COLORS[i], label=label)
        ax.bar_label(bars, labels=[fmt(y) for y in ys], fontsize=7, color=INK, padding=2)
    if target:
        ax.axhline(target, color=MUTED, linestyle="--", linewidth=1)
    ax.set_xticks(range(len(LEVELS)), [str(lv) for lv in LEVELS])
    ax.set_title(title, loc="left", color=INK, fontsize=11)
    style(ax, ylabel)
    ax.set_ylim(0, ax.get_ylim()[1] * 1.12)
    if target:
        ax.text(-0.45, target + ax.get_ylim()[1] * 0.015, target_label, va="bottom", ha="left", fontsize=8, color=MUTED)
    ax.legend(frameon=False, fontsize=8, loc="lower left", bbox_to_anchor=(0, 1.0), ncol=len(names))
    ax.set_title(title, loc="left", color=INK, fontsize=11, pad=24)
    fig.tight_layout()
    fig.savefig(ROOT / filename)
    print(f"\nĐã vẽ {filename}")


grouped(
    ["a3-devices-list-cache-stress", "b2-devices-list-nocache-stress"],
    1,
    "Stress GET /devices (không nghỉ) — thời gian phản hồi TB",
    "Thời gian phản hồi TB (ms)",
    100,
    "mục tiêu < 100 ms",
    "chart-stress-cache-vs-nocache.png",
    lambda y: f"{y:.0f}",
)
grouped(
    ["a3-devices-list-cache-stress", "b2-devices-list-nocache-stress"],
    0,
    "Stress GET /devices (không nghỉ) — thông lượng tối đa",
    "Request/giây",
    100,
    "mục tiêu ≥ 100 req/s",
    "chart-stress-throughput.png",
    lambda y: f"{y:.0f}",
)
