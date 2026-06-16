"""Command-line interface: validate | suggest | generate."""
from __future__ import annotations

import argparse
import sys

from . import engine, generate as gen, loader, suggest as sug


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="timetabler",
        description="Ashesi timetabling rules engine",
    )
    parser.add_argument("--data", default="tests/fixtures",
                        help="directory with courses/faculty/rooms JSON files")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("validate", help="check the timetable and score it")

    p = sub.add_parser("suggest", help="rank legal slots for one meeting")
    p.add_argument("course")
    p.add_argument("--section", type=int, default=1)
    p.add_argument("--kind", default="lecture",
                   choices=["lecture", "discussion", "lab"])
    p.add_argument("--index", type=int, default=0)
    p.add_argument("--top", type=int, default=5)

    p = sub.add_parser("generate", help="build a draft timetable from scratch")
    p.add_argument("--save", action="store_true",
                   help="overwrite timetable.json with the draft")

    args = parser.parse_args(argv)
    ds = loader.load_dataset(args.data)

    if args.command == "validate":
        placements = loader.load_timetable(args.data)
        text = engine.report(ds, placements)
        print(text)
        violations = engine.validate(ds, placements)
        return 1 if violations else 0

    if args.command == "suggest":
        placements = loader.load_timetable(args.data)
        options = sug.suggest(ds, placements, args.course, args.section,
                              args.kind, args.index, args.top)
        if not options:
            print("No legal options found.")
            return 1
        print(f"Best options for {args.course} sec{args.section} {args.kind}:")
        for i, o in enumerate(options, 1):
            print(f"  {i}. {o.label(ds)}")
        return 0

    if args.command == "generate":
        draft = gen.generate(ds)
        print(engine.report(ds, draft))
        if args.save:
            path = loader.save_timetable(args.data, draft)
            print(f"\nSaved draft to {path}")
        else:
            print("\n(dry run: pass --save to write timetable.json)")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
