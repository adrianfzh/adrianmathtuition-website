# Science: question types missing from the sub-skill tree (12 Oct 2026)

**Outcome (Adrian, 12 Oct 2026: "yes"):** 16 of the 19 proposed types were added to the science
`subgroups` table (ids 307–322, description ends "[added 12 Oct 2026: skipped-question review]").
Three were left out as duplicates of a type in another topic: collecting and drying gases (CHEM
Measurement #85 already covers it), asexual reproduction in plants (BIO Cell Division #273),
effects of alcohol and drugs (BIO Nutrition in Humans #199). The worker's seen ledger
(`/data/home/Library/Logs/adrianmath/file-subgroups-seen-science.json`) lost its 140 entries for the
105 questions the new types cover, so the next `file-subgroups-science` runs read them again (copy
kept as `….before-2026-10-12-new-types`). Not done: the ~90 questions with a missing topic tag.
Why the ledger looked like a 4,000 backlog: `--status` on a Mac has no ledger, the worker's has
3,860 set-aside entries — "0 still to file" on /admin/ops means nothing NEW, not nothing unfiled.


## Split of the 2,159 skipped entries (2,049 distinct questions)

- **Mainly another topic, correctly skipped: ~1,800.** 1,903 entries are for questions ALREADY filed under a type in another topic (most skipped questions carry 2+ topic tags). The readers judged ~5.5% of those (≈105) as also fitting a type here.
- **Fits an existing type: ~195.** ≈105 too-strict calls among the filed ones, plus ≈90 unfiled ones that fit a type in a topic the question is NOT tagged with (e.g. boat-across-river vectors tagged Forces/Kinematics fit Measurement → Scalars, vectors and resultants; ADH questions tagged Excretion fit Homeostasis → ADH; simple/fuel cells tagged Energy from Chemicals fit Electrolysis → Simple cells and fuel cells; genetic engineering tagged Microorganisms fits Molecular Genetics → Transgenic organisms).
- **Genuinely missing type: 152 entries (133 questions)** — listed below.
- **Junk / mixed: ~14** (multi-topic "name the process/reaction" tables, mis-tagged questions). No diagram-only stubs or answer-key rows were found.

Note: the worker ledger stores no reason text, only status + time. Only 219 of the 2,049 skipped questions are filed nowhere at all; that is where the real gap is.

## Proposed new types (with all question ids; first two are the examples)

- **BIO · Microorganisms and Biotechnology → Sewage treatment by microorganisms** — 7 questions. Examples: `2b9d8f7e-711c-42e9-820b-8eb3e69dbd74`, `000a391d-bebc-40ae-bd6f-f27ab2b8d247`. All: 2b9d8f7e-711c-42e9-820b-8eb3e69dbd74, 000a391d-bebc-40ae-bd6f-f27ab2b8d247, 521154e5-cffe-43b5-8c75-761fed3649bf, 67ddf52b-3631-4eb5-8f0c-57b7f2892938, 502414a3-53cf-4fee-a237-c459c62b9265, 4aff4f60-36e3-4d95-bc76-f874fcc0f518, 28929a84-e6dd-46cd-937e-3e3b2ef85c0e
- **BIO · Respiration and Gas Exchange → Carbonic anhydrase: carrying carbon dioxide in the blood** — 7 questions. Examples: `517acbca-49e4-4ac9-8073-f8f742c41b9c`, `e718026c-342f-4a05-8cfa-41efe8453a67`. All: 517acbca-49e4-4ac9-8073-f8f742c41b9c, e718026c-342f-4a05-8cfa-41efe8453a67, ccd59e47-356b-48d7-bc01-ec4a53e759b4, 57ae1361-177c-493f-ab3e-efc32795b919, f39d3fd7-ea54-4279-a5ff-bb3bc14fb3c9, 98c57b1b-b3f4-4493-b1ea-72e062960503, 6d693283-1a11-4852-b680-175eb1e015d9
- **BIO · Organisms and their Environment → Population growth curves** — 4 questions. Examples: `e9c76287-8161-488b-9904-50e7edda7f4a`, `92712bc7-d09f-467c-a897-e90e6778906c`. All: e9c76287-8161-488b-9904-50e7edda7f4a, 92712bc7-d09f-467c-a897-e90e6778906c, a13cb5c5-2447-46a3-8eee-d5dfbdfa179e, 2a42c595-73a6-411a-92a0-3d8ab2046858
- **BIO · Coordination and Response (Nervous System) → Effects of alcohol and drugs (reaction time)** — 4 questions. Examples: `8bb6c57e-6abb-40cd-81d4-52ef93ec4391`, `60dbce0c-0be6-4fd0-9750-0f29d93fbb26`. All: 8bb6c57e-6abb-40cd-81d4-52ef93ec4391, 60dbce0c-0be6-4fd0-9750-0f29d93fbb26, 5e88e87f-66ce-4c30-9637-a210262e5456, 5bf611cb-2b83-44c3-935c-a42eff1a488b
- **BIO · Sexual Reproduction in Plants → Asexual reproduction in plants** — 4 questions. Examples: `8832b970-4c86-4b84-a8b8-be8ede346178`, `7cb8a534-c92a-4c93-8b6b-474ba4de3ff3`. All: 8832b970-4c86-4b84-a8b8-be8ede346178, 7cb8a534-c92a-4c93-8b6b-474ba4de3ff3, 564622bc-4473-4451-a773-155eedc9ac2f, 61531837-c806-4e19-9de5-b0c46ffaf22c
- **BIO · Nutrition in Plants → How a plant uses the glucose it makes** — 3 questions. Examples: `89905808-ed6d-41fd-8899-4aec4619756e`, `348bfdc1-7be7-44df-9b1c-0fbbdf6eef80`. All: 89905808-ed6d-41fd-8899-4aec4619756e, 348bfdc1-7be7-44df-9b1c-0fbbdf6eef80, 017af9ed-5f25-4cf3-885a-d914d1b15d6d
- **BIO · Nutrition in Plants → Leaf gas exchange in light and dark** — 3 questions. Examples: `fee2342e-6ad4-4c85-b33d-9489f6d6216f`, `fe0cb7cd-eedb-4947-beb2-f4e03934c917`. All: fee2342e-6ad4-4c85-b33d-9489f6d6216f, fe0cb7cd-eedb-4947-beb2-f4e03934c917, 0ead0ffe-c2fd-4fc0-873d-a7d254895239
- **BIO · Respiration and Gas Exchange → Respiration in yeast** — 2 questions. Examples: `c5bdc205-0d00-46f4-ac53-1cd216716551`, `5c0dba1f-7bfa-40ac-a769-0e99406c698f`. All: c5bdc205-0d00-46f4-ac53-1cd216716551, 5c0dba1f-7bfa-40ac-a769-0e99406c698f
- **CHEM · Methods of Purification → Collecting and drying gases** — 20 questions. Examples: `f65fc746-ef0a-424e-bea2-b46c31e67da9`, `0261c54b-8a99-4caa-8bfe-0829bdf0e571`. All: f65fc746-ef0a-424e-bea2-b46c31e67da9, 0261c54b-8a99-4caa-8bfe-0829bdf0e571, 0ecaeaba-f6d1-46e0-9aee-4f2ac6f083cc, 2d9d7d43-0496-49d8-bb9a-1fe39e9aa93d, 0bd87cd5-1c53-4906-bbae-d22669bcac52, 5379c2d3-0348-4c06-b6f6-5b9c7a578f72, d3c71642-ce9c-4d83-880a-1cc7f4904849, fe7526af-8afa-4f61-b657-96fbc719fba6, c34c1ec4-40e2-42fd-a0ba-ec19200922e1, cff623d6-c0a8-4651-8633-93d1168dd818, 05171798-018f-441b-8a11-70218c65acd6, d0a58a3a-58f1-492a-805f-279ab5a2a48e, bf48c3e1-808d-443e-b68d-4dd9a8eac77b, 6943366c-6f2e-4911-98cb-69c2c929b2b4, fc60afa2-dc68-4600-8996-072805c73ad6, f02d1435-dcc1-4834-9bfe-c3291716b4a9, da184151-adf7-458a-aa1e-b8df537ec121, 2790d773-050a-4f0a-b93d-208cea8b7e87, 4e49a60c-317c-4cf8-93af-3823bbf9eae6, 3f3362d8-8cad-45fd-977c-fd26f495aa07
- **CHEM · Measurement → Reading a burette or thermometer** — 4 questions. Examples: `a6b8c99e-30e9-4950-a76f-20192c098a7f`, `fd4a7896-e929-4a6a-bfe9-5c9805fa1b1a`. All: a6b8c99e-30e9-4950-a76f-20192c098a7f, fd4a7896-e929-4a6a-bfe9-5c9805fa1b1a, e11689c1-d618-4c6a-b98c-e9c714d4be25, a41d482c-6d80-4b45-87b4-2be7b0f0fc4b
- **CHEM · Metals → Why we recycle metals** — 3 questions. Examples: `4ec35bd5-7bef-405b-8920-c04049ea07a5`, `24bc16ab-8235-47ae-9e0e-0f777effa850`. All: 4ec35bd5-7bef-405b-8920-c04049ea07a5, 24bc16ab-8235-47ae-9e0e-0f777effa850, 6fdae3ba-a551-4434-b426-fff4f7a042b8
- **PHY · Measurement → Timing a pendulum: period and oscillations** — 21 questions. Examples: `822fc0e5-845c-463d-9294-94b9a6598ddf`, `adf8cf77-b27c-4f4b-add0-840c2398dd70`. All: 822fc0e5-845c-463d-9294-94b9a6598ddf, adf8cf77-b27c-4f4b-add0-840c2398dd70, 96f1be71-b4f3-4613-ab63-cd01cdb4ecc8, 1ac27ada-75da-443d-9caf-62b1634ee8da, 0f2da5bc-b9c3-4011-9641-e8173e779d9e, 00e75c5f-5a29-4821-bde0-49618ac4319e, bfe1114e-e21e-4240-b095-98780d2aa4a0, 65cf0bf6-6d8b-4a37-a097-6d2c9a6e35bc, 66387d7b-1080-4923-aaca-e145825eb065, c06079a9-f784-42ea-9ed3-607aa29a3afb, acc434ad-cbb5-4f3a-9de7-bad3773d5e59, 40b9a6bc-bbda-472c-8193-0d6795bd5d3e, 85a5b4fa-51c2-465e-b1f5-df674ace5067, 3712e787-9857-41f0-be89-5178f7e7db21, 95321e6a-6020-4c46-92c6-dc148926eaa8, fbaa5bcd-280d-4a0e-9691-4e110432d1cf, 80a6ae3e-13c5-4d67-be4c-af592b1a8ca5, 326751d9-ee1f-4ac6-a280-ae3804828bf9, 9c3a3f21-453d-4b34-bfc1-fc0cef4f7a4a, 31c625f3-87d4-496a-870a-261cd69495e6, 4c1afb64-3cfc-4c90-9d3b-451859b74318
- **PHY · Measurement → Reading vernier calipers and micrometers** — 15 questions. Examples: `264dd1e5-dc10-40cc-b128-f86361bf3098`, `8e137716-5983-4e66-9176-310733a8f0ae`. All: 264dd1e5-dc10-40cc-b128-f86361bf3098, 8e137716-5983-4e66-9176-310733a8f0ae, 527f2d33-638d-4f4e-93df-88f48b0fab47, 4906ff8d-c09e-4884-a604-09a6d6997f0e, 5ae98f01-e23f-4527-986b-354293e699c3, 99e88dc2-bcf1-4a53-b747-8cbed2d069b5, a432fd1d-acd6-4b24-bace-d15dd657a0d2, 71e89652-1f83-4f45-845b-018c7e102e52, 7a23438f-d9d6-400f-9954-781e370eef5e, 2cf47c83-9209-46d2-9a7b-90f9d783219f, cef39142-87f7-41f6-a921-12f2256c66ff, 4abf9dac-91a4-41ba-b75a-8dbb8917f9de, fcffe2ea-b1a9-4b3d-b27c-952759ac4c98, 3a6b1bf7-c981-4741-9042-8c2849a931d9, 61e71140-ce29-4284-ad8f-71d949e3a48b
- **PHY · Measurement → Reading a stopwatch, ruler or measuring cylinder** — 11 questions. Examples: `5eb4e63e-acbb-4d45-b910-4fb947122ca7`, `1ffe0b9c-3385-4e86-9d9a-d3b562365242`. All: 5eb4e63e-acbb-4d45-b910-4fb947122ca7, 1ffe0b9c-3385-4e86-9d9a-d3b562365242, a0b53c1f-b556-48f1-932e-0e93ad27c8a2, c35b2e68-e10d-4604-934d-f0279173db83, d6991ced-fa89-4f8a-8777-b3a0cb9f1d6e, 8b8af08d-bfbc-4c78-903b-28c62976489d, e21837c1-0555-4267-8bd5-7ff37a9c3372, afae0430-f229-4b8c-8386-6921aa17d99d, b2aa2668-c7b7-441a-92dd-ca88f0fb0c9e, 44708b6a-313f-4984-8afd-5ccdb8cd35b9, 5d464ed1-0df1-490a-af39-867d1961def8
- **PHY · Measurement → Practical paper: doing an experiment (table, graph, improvements)** — 10 questions. Examples: `b5cd7055-33d3-4062-8f47-4b4d7fd47a3f`, `54132b3c-092a-4a1e-b34e-e22279f8fe91`. All: b5cd7055-33d3-4062-8f47-4b4d7fd47a3f, 54132b3c-092a-4a1e-b34e-e22279f8fe91, c6376249-1161-4cf3-86ea-dd8cec25c7fe, ed0ca5a9-f494-46eb-9b7b-219cafd7698e, e3f3fefc-77e8-4650-b3ae-63c28a6f3635, 39aaaf46-1f7a-4f27-b60b-c601cb997254, cd37fe41-a265-426d-81f2-6a52200a1e56, b8fc101c-0b6e-42fc-85f4-4a99c7dc11fd, 639ef651-3b71-4ef4-8610-081ff8f754fe, b855e71d-0b08-4e82-8126-33cba9417f30
- **PHY · Thermal Properties of Matter → Thermometers and temperature scales** — 6 questions. Examples: `f2e9a39e-ae14-442c-8a4f-72d6a85bda52`, `b1a472eb-1b70-4c1b-bc20-321d7147ce86`. All: f2e9a39e-ae14-442c-8a4f-72d6a85bda52, b1a472eb-1b70-4c1b-bc20-321d7147ce86, b63cdd00-dd87-4eee-9806-642d9915a79e, c0e42999-d190-4429-8b5a-5e5ee2931010, c67c82cf-f1e3-4e99-bf93-3148a276321c, b99c5732-d36e-46fd-b392-dae4c5cd6b8e
- **PHY · Magnetism → Demagnetising a magnet** — 4 questions. Examples: `5240bab1-00c6-40d1-af7f-6092d8e333cc`, `c49ef7c1-9c62-46c2-a0f4-820c8439ac94`. All: 5240bab1-00c6-40d1-af7f-6092d8e333cc, c49ef7c1-9c62-46c2-a0f4-820c8439ac94, c16e2ef3-9bd8-4f09-86ed-51f21b394e82, 3f91866f-cbc7-408b-8aa3-50aacbea815d
- **PHY · Thermal Properties of Matter → Expansion when heated** — 3 questions. Examples: `870053a6-a082-4f3f-8932-f14a0004a76c`, `3dd9f9c7-cd71-4f64-bfa5-b7a3c4467d79`. All: 870053a6-a082-4f3f-8932-f14a0004a76c, 3dd9f9c7-cd71-4f64-bfa5-b7a3c4467d79, ca9e2f2b-4a5d-4506-a242-9af4f79520d5
- **PHY · Forces → Springs and Hooke's law** — 2 questions. Examples: `631158cc-3d71-4333-844d-9dc26cb67e4c`, `4ece19b0-91f0-4f56-a427-34b02bbf6968`. All: 631158cc-3d71-4333-844d-9dc26cb67e4c, 4ece19b0-91f0-4f56-a427-34b02bbf6968

## Not proposed (looked like gaps, but a type already exists elsewhere)

- Blood glucose / diabetes under Homeostasis (79) → already filed in Coordination and Response (Hormones).
- Digestive enzymes under Enzymes (38) → Nutrition in Humans → Digestive enzymes.
- Latent heat, evaporation, heat capacity under Kinetic Particle Theory (45) → Thermal Properties of Matter.
- Series/parallel, LDR/thermistor, power under Current of Electricity (69) → D.C. Circuits / Practical Electricity.
- Vectors, mass and weight under Forces (42) → Measurement / Mass Weight and Density.
- Haber process under Atmosphere (37) → Salts → Ammonia and the Haber process.
- Fuel cells, simple cells under Energy from Chemicals (43) → Electrolysis → Simple cells and fuel cells.
- Thermal decomposition under Salts (15) → Metals → Reactivity series.
- Moles / empirical formula under Formulae and Equations (17) → Chemical Calculations.
- Genetic engineering under Microorganisms (28) → Molecular Genetics → Transgenic organisms.
- Sewage: 9 of 16 are filed under Impact of Humans → Pollution effects, a loose fit; the new Sewage type would take all 16.

## Per-topic counts (all skipped entries; "unfiled" = question filed under no type anywhere)

| tree | topic | skipped | unfiled | current types |
|---|---|---|---|---|
| CHEM | Oxidation and Reduction | 124 | 6 | 3 |
| CHEM | Metals | 101 | 6 | 3 |
| BIO | Homeostasis | 96 | 3 | 4 |
| PHY | Practical Electricity | 93 | 1 | 4 |
| CHEM | Acids and Bases | 87 | 13 | 6 |
| PHY | Current of Electricity | 79 | 3 | 5 |
| PHY | Forces | 77 | 8 | 5 |
| CHEM | Salts | 68 | 4 | 7 |
| PHY | Kinetic Particle Theory | 64 | 1 | 3 |
| BIO | Enzymes | 63 | 2 | 2 |
| CHEM | Atmosphere and Environment | 63 | 1 | 5 |
| CHEM | Energy from Chemicals | 62 | 8 | 4 |
| PHY | Measurement | 59 | 53 | 3 |
| BIO | Microorganisms and Biotechnology | 49 | 12 | 10 |
| CHEM | Chemical Formulae and Equations | 47 | 3 | 4 |
| BIO | Transport in Humans | 46 | 3 | 8 |
| BIO | Coordination and Response (Hormones) | 46 | 1 | 6 |
| PHY | Kinematics | 46 | 6 | 5 |
| BIO | Molecular Genetics | 44 | 0 | 7 |
| CHEM | Macromolecules | 44 | 3 | 2 |
| BIO | Organisms and their Environment | 41 | 4 | 5 |
| CHEM | Methods of Purification | 40 | 17 | 6 |
| BIO | Excretion | 39 | 5 | 4 |
| BIO | Respiration and Gas Exchange | 38 | 13 | 7 |
| CHEM | Alcohols and Carboxylic Acids | 38 | 1 | 3 |
| CHEM | Chemical Calculations | 37 | 2 | 6 |
| BIO | Nutrition in Plants | 37 | 7 | 7 |
| CHEM | Atomic Structure | 37 | 2 | 6 |
| CHEM | Rate of Reaction | 35 | 1 | 5 |
| PHY | Electromagnetism | 33 | 2 | 3 |
| PHY | Pressure | 33 | 0 | 4 |
| CHEM | Hydrocarbons and Fuels | 32 | 1 | 7 |
| BIO | Sexual Reproduction in Plants | 28 | 3 | 1 |
| BIO | Coordination and Response (Nervous System) | 28 | 4 | 2 |
| PHY | Energy Work and Power | 27 | 2 | 6 |
| BIO | Inheritance | 25 | 3 | 7 |
| PHY | Thermal Properties of Matter | 24 | 11 | 9 |
| BIO | Variation and Selection | 24 | 1 | 7 |
| PHY | D.C. Circuits | 23 | 1 | 4 |
| CHEM | The Periodic Table | 22 | 3 | 5 |
| CHEM | Covalent Bonding and Structure | 19 | 1 | 7 |
| PHY | General Wave Properties | 19 | 2 | 3 |
| CHEM | Measurement | 13 | 6 | 2 |
| CHEM | Ionic Bonding | 12 | 2 | 4 |
| CHEM | Kinetic Particle Theory | 11 | 4 | 4 |
| BIO | Transport in Plants | 10 | 0 | 7 |
| BIO | Nutrition in Humans | 9 | 0 | 7 |
| BIO | Sexual Reproduction in Humans | 9 | 0 | 7 |
| CHEM | Electrolysis | 9 | 0 | 6 |
| PHY | Mass Weight and Density | 8 | 0 | 2 |
| BIO | Impact of Humans on the Environment | 8 | 7 | 4 |
| BIO | Cell Structure and Organisation | 7 | 0 | 6 |
| PHY | Electromagnetic Spectrum | 5 | 2 | 3 |
| PHY | Magnetism | 5 | 4 | 2 |
| PHY | Sound | 5 | 3 | 2 |
| PHY | Light | 2 | 1 | 4 |
| PHY | Turning Effect of Forces | 2 | 1 | 3 |
| PHY | Static Electricity | 2 | 1 | 4 |
| BIO | Biological Molecules | 2 | 2 | 5 |
| PHY | Electromagnetic Induction | 2 | 0 | 4 |
| BIO | Cell Division | 1 | 0 | 8 |

Working files (same folder): skipped.jsonl, skipped_qs.json, skipped_qsg.json, subgroups.json, topics/*.json, cls/*.json (Sonnet verdicts for the top 16 topics), unfiled.json, proposed.json.