"""Import the approved 2026-09-25 narrator batch without altering its audio.
Usage: python scripts/import-narrator-audio.py [downloads_directory]
Requires ffprobe + ffmpeg. Originals remain in Downloads as a backup.
"""
from pathlib import Path
import hashlib, json, re, shutil, subprocess, sys

# The user discarded all editing attempts. These exact five source files are final.
APPROVED_REPLACEMENTS = {
    "Wayne-June-(Darkest-Dungeon)-2026-09-26-00-06-[Exciting]-excellent-hit!-forcefulLet-them-feel.mp3",
    "Wayne-June-(Darkest-Dungeon)-2026-09-26-00-07-[Exciting]-Splendid!-forcefulStrike-again,-befor.mp3",
    "Wayne-June-(Darkest-Dungeon)-2026-09-26-00-16-[Exciting]-tremendous-blow!forceful-Courage-surg.mp3",
    "Wayne-June-(Darkest-Dungeon)-2026-09-26-00-18-[Exciting]-Magnificent-sorcery!forceful-Their-su.mp3",
    "Wayne-June-(Darkest-Dungeon)-2026-09-26-00-19-[Exciting]-Glorious-devastation!-forceful-Not-on.mp3",
}

# Explicit prefix -> semantic pool. No guessing from file order or troop names.
RULES = """
mana_surge.ally|Mana-surge!-Abundant
mana_surge.enemy|Mana-surge!-Even
mana_surge.ally|Mana-surge!-The-invocation
mana_surge.ally|Mana-surge!-Such-potential
mana_surge.enemy|Mana-surge!-Their-malice
mana_surge.enemy|Mana-surge!-An-alarming
match4.ally|Four-matched!-A-calculated
extra_turn.ally|Extra-turn!-A-brief
extra_turn.ally|Extra-turn!-Make-their
extra_turn.enemy|Extra-turn!-Their-appetite
extra_turn.enemy|Extra-turn!-No-interval
heavy.ally|[Exciting]-excellent-hit!
heavy.ally|[Exciting]-Splendid!
heavy.ally|[Exciting]-tremendous-blow!
spell_heavy.ally|[Exciting]-Magnificent-sorcery!
aoe_heavy.ally|[Exciting]-Glorious-devastation!
match4.ally|Four-matched!-Let
match4.enemy|Four-matched!-An-ugly
match4.enemy|Four-matched!-They
match5.ally|Five-matched!-A-magnificent
match5.ally|Five-matched!-An-elegant
match5.enemy|Five-matched!-Fortune
match5.enemy|Five-matched!-What
cascade.ally|Cascade!-Each
cascade.enemy|Cascade!-Observe
grand_cascade.ally|Grand-cascade!-The-gratifying
grand_cascade.enemy|Grand-cascade!-A-succession
skull.ally|Skull-strike!-A-blunt
skull.enemy|Skull-strike!-Your
armor_break.enemy|Armor-broken!-Flesh
armor_break.ally|Armor-broken!-Their
mana_drain.enemy|Mana-drain!-An-elaborate
mana_drain.ally|Mana-drain!-Grand
barrier.ally|Barrier!-A-prudent
barrier.enemy|Barrier!-An-obstruction
healing.ally|Healing!-Enough
healing.enemy|Healing!-Our
poison.ally|Poisoned!-A-measured
poison.enemy|Poisoned!-The-injury
summon.ally|Summoning!-Reinforcements
summon.enemy|Summoning!-Their
devour.enemy|Devoured!-A-lifetime
devour.ally|Devoured!-A-practical
victory.normal|A-well-earned-victory
victory.overwhelming|An-overwhelming-victory
victory.costly|A-costly-victory
victory.normal|A-satisfactory-victory
defeat.normal|A-bitter-defeat
defeat.crushing|A-crushing-defeat
defeat.total|A-total-defeat
defeat.normal|An-instructive-defeat
retreat.normal|A-prudent-retreat
retreat.costly|A-costly-retreat
retreat.normal|An-ignominious-retreat
heavy.ally|A-grievous-blow
heavy.ally|Considerable-force
heavy.ally|Their-defenses
heavy.enemy|A-grievous-wound
heavy.enemy|A-sobering-impact
heavy.enemy|An-ugly-reminder
spell_heavy.ally|A-potent-invocation
spell_heavy.enemy|Their-sorcery
aoe_heavy.ally|An-economical-devastation
aoe_heavy.enemy|Wounds-throughout
silence.ally|Silenced!-At-last
silence.enemy|Silenced!-All-that
frozen.enemy|Frozen!-Resolve
frozen.ally|Frozen!-Their
transform.ally|Transformed!-A-most
transform.enemy|Transformed!-Familiar
transform_self.ally|Transformed!-The-former
stun.ally|Stunned!-Thought
stun.enemy|Stunned!-An-unfortunate
entangle.ally|Entangled!-Much
entangle.enemy|Entangled!-Strength
web.ally|Webbed!-Such
web.enemy|Webbed!-A-humiliating
curse.ally|Cursed!-Their
curse.enemy|Cursed!-An-unwelcome
burning.ally|Bur-ning!-Their
burning.enemy|Burning!-Composure
death_mark.ally|Death-mark!-A-prognosis
death_mark.enemy|Death-mark!-Your
treasure.appear|A-treasure!-Your
treasure.fled|There-goes-your-fortune
treasure.defeated|A-profitable-encounter
""".strip()

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads"
dest = root / "src/assets/audio/narrator"
archive = root / "assets/audio/narrator/archive"
dest.mkdir(parents=True, exist_ok=True)
archive.mkdir(parents=True, exist_ok=True)
rules = [line.split("|", 1) for line in RULES.splitlines()]
# Explicit generation timestamps, not copy-dependent filesystem timestamps.
files = [f for f in source.glob("*.mp3")
         if re.search(r"2026-09-(?:25-(?:22|23)|26-00)-", f.name)
         and (f.name.startswith("darkest-dungeon-narrator-clean-") or f.name.startswith("Wayne-June-"))
         and not f.stem.endswith("-trimmed")
         and ("2026-09-25" in f.name or f.name in APPROVED_REPLACEMENTS)]
files.sort(key=lambda f: (re.search(r"2026-09-\d{2}-\d{2}-\d{2}", f.name)[0], f.name))
if not files:
    raise SystemExit("No matching source audio")
missing = APPROVED_REPLACEMENTS - {f.name for f in files}
if missing:
    raise SystemExit("Missing finalized replacement audio: " + ", ".join(sorted(missing)))
manifest, counters = [], {}
for f in files:
    suffix = re.split(r"2026-09-\d{2}-\d{2}-\d{2}-", f.name, maxsplit=1)[1]
    matches = [pool for pool, prefix in rules if suffix.startswith(prefix)]
    if len(matches) != 1:
        raise SystemExit(f"Unmapped or ambiguous file: {f.name}")
    pool = matches[0]
    old_heavy = pool in ("heavy.ally", "spell_heavy.ally", "aoe_heavy.ally") and "2026-09-25" in f.name
    earlier_stun = pool == "stun.ally" and "-23-13-" in f.name
    enabled = not (old_heavy or earlier_stun)
    counters[pool] = counters.get(pool, 0) + 1
    clip_id = pool.replace(".", "_") + "_" + re.search(r"2026-09-\d{2}-\d{2}-\d{2}", f.name)[0].replace("-", "") + f"_{counters[pool]:02d}"
    target = (dest if enabled else archive) / (clip_id + ".mp3")
    raw = f.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise SystemExit(f"Existing asset differs: {target}")
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(f)
    ], encoding="utf-8"))
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-f", "null", "-"], check=True,
                   stdout=subprocess.DEVNULL)
    shutil.copy2(f, target)
    assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
    notes = []
    if earlier_stun: notes.append("Earlier take retained as archive; 23:14 take selected for runtime.")
    if old_heavy: notes.append("Superseded by the five user-selected 2026-09-26 excited heavy-hit recordings.")
    if "Bur-ning" in f.name: notes.append("Source spelling Bur-ning: pronunciation needs human listening review.")
    if "clarity.u" in f.name: notes.append("Source ends in .u: confirm no spoken trailing letter during listening review.")
    if pool == "treasure.appear": notes.append("Recorded label is A treasure!, not A treasure goblin!; used for Treasure Gnome only.")
    audio = next(s for s in probe["streams"] if s["codec_type"] == "audio")
    manifest.append(dict(id=clip_id, pool=pool, enabled=enabled,
        file=str(target.relative_to(root)).replace("\\", "/"), sourceFilename=f.name,
        sha256=digest, bytes=len(raw), duration=round(float(probe["format"]["duration"]), 3),
        sampleRate=int(audio["sample_rate"]), channels=audio["channels"],
        importedDate="2026-09-26", notes=notes))
# Migrate previous manifest names with hash verification; never delete unrelated assets.
previous_path = dest / "manifest.json"
if previous_path.exists():
    previous = json.loads(previous_path.read_text(encoding="utf-8"))
    # Later batches belong to their own importer; retain them unchanged.
    imported_sources = {m['sourceFilename'] for m in manifest}
    manifest.extend(m for m in previous if m['sourceFilename'] not in imported_sources)
    current_names = {m["file"] for m in manifest}
    by_source = {m["sourceFilename"]: m for m in manifest}
    for old in previous:
        old_path = root / old["file"]
        replacement = by_source.get(old["sourceFilename"])
        if replacement and old["file"] not in current_names and old_path.is_file():
            if old_path.resolve().parent not in (dest.resolve(), archive.resolve()):
                raise SystemExit("Unexpected previous asset location")
            if hashlib.sha256(old_path.read_bytes()).hexdigest() != replacement["sha256"]:
                raise SystemExit("Previous asset was edited; preserve and review manually")
            old_path.unlink()
(dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(dict(imported=len(manifest), active=sum(x["enabled"] for x in manifest),
                     bytes=sum(x["bytes"] for x in manifest),
                     shortest=min(x["duration"] for x in manifest),
                     longest=max(x["duration"] for x in manifest)), indent=2))

