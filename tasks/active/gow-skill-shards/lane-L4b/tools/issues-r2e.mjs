export default [
  { id: 'L4b-chosen-colour-exclusion', affects: ['troop:6124', 'troop:6256', 'troop:6399', 'troop:6824', 'troop:6216', 'troop:6987', 'troop:7705', 'troop:6541', 'troop:7276'],
    note2: 'Round 2: same gap for chosen cells: AiCellChooser picks the centre-most gem of any type and ignores native Target ManaGemsOnly (troop:7276 after the L4b-7276-singlegem fix). Needs chooser/UI support for native target restrictions (engine + src/render/App.ts palette).' },
];
