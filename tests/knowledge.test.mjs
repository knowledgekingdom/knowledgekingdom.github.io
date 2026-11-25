// Tests for scripts/knowledge.mjs (the knowledge data layer). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, validate } from '../scripts/knowledge.mjs';

test('parseDate reads the ways the book writes dates', () => {
  const cases = {
    'c. 3100 BCE': [-3100, -3100, true],
    '3500–3100 BCE': [-3500, -3100, false],
    'c. 2112-2004 BCE': [-2112, -2004, true],
    '27 BCE–14 CE': [-27, 14, false],
    '1453': [1453, 1453, false],
    '1914–1918': [1914, 1918, false],
    '476 CE': [476, 476, false],
    '29 May 1453': [1453, 1453, false],
    '1450s': [1450, 1459, false],
    '5th century BCE': [-500, -401, false],
    '15th century': [1401, 1500, false],
    '15th–16th centuries': [1401, 1600, false],
    '7th millennium BCE': [-7000, -6001, false],
    'c. 3.3 million years ago': [-3298000, -3298000, true],
    'c. 3.9–2.9 million years ago': [-3898000, -2898000, true],
    'c. 315,000 years ago': [-313000, -313000, true],
    'c. 26,500–19,000 years ago': [-24500, -17000, true],
    'around 12,000–10,000 BCE': [-12000, -10000, true],
  };
  for (const [s, [start, end, approx]] of Object.entries(cases)) {
    assert.deepEqual(parseDate(s), { start, end, approx }, s);
  }
});

test('parseDate refuses nonsense and backwards ranges', () => {
  for (const s of ['soon', '', '0', '1918–1914', '2.9–3.9 million years ago', '1455s', '16th–15th centuries', 'Smarch 1453', null]) {
    assert.equal(parseDate(s), null, String(s));
  }
});

const index = {
  ids: new Map([['009/africa', '/009-x/africa/'], ['009/', '/009-x/'], ['011/uruk', '/011-y/uruk/']]),
  moved: { '009/old-africa': '009/africa' },
};
const empty = () => ({ events: [], places: [], routes: [], concepts: [] });
const place = (o = {}) => ({ id: 'uruk', name: 'Uruk', bg: 'Урук', lat: 31.3, lon: 45.6, type: 'city', sections: ['011/uruk'],
  source: 'wikidata:Q168518', status: 'proposed', ...o });
const event = (o = {}) => ({ id: 'e1', label: 'Something', bg: 'Нещо', date: 'c. 3200 BCE', precision: 'approximate',
  region: 'west-asia', sections: ['011/uruk'], status: 'approved', ...o });

test('valid data passes', () => {
  const d = empty();
  d.places.push(place());
  d.events.push(event({ place: 'uruk' }));
  d.routes.push({ id: 'r1', name: 'Road', bg: 'Път', places: ['uruk', 'uruk'], sections: ['011/uruk'], status: 'proposed' });
  d.concepts.push({ id: 'c1', term: 'Hominin', bg: 'Хоминин', definition: 'x', definitionBg: 'у', defined: '009/africa', status: 'proposed' });
  assert.deepEqual(validate(d, index), { errors: [], warnings: [] });
});

test('the build stops on the mistakes that matter', () => {
  const d = empty();
  d.places.push(place(), place({ lat: 120 }));                                        // duplicate id, bad latitude
  d.events.push(event({ id: 'e2', sections: ['009/missing'] }));                       // section that doesn't exist
  d.events.push(event({ id: 'e3', sections: ['009/old-africa'] }));                    // section that moved
  d.events.push(event({ id: 'e4', date: 'sometime' }));                                // unreadable date
  d.events.push(event({ id: 'e5', precision: 'year' }));                               // "c." but not approximate
  d.events.push(event({ id: 'e6', region: 'atlantis', place: 'nowhere' }));            // bad region and place
  d.events.push(event({ id: 'E 7', status: 'maybe' }));                                // bad id and status
  d.concepts.push({ id: 'c1', term: 'x', definition: 'y', defined: '009/africa', related: ['ghost'], status: 'proposed' });
  const { errors } = validate(d, index);
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}\n${errors.join('\n')}`);
  has(/“uruk”: id also used/);
  has(/lat must be/);
  has(/section “009\/missing” doesn't exist/);
  has(/moved to “009\/africa”/);
  has(/date “sometime”/);
  has(/precision must be approximate/);
  has(/region must be one of/);
  has(/place “nowhere” isn't in places.yaml/);
  has(/id must be lowercase/);
  has(/status must be one of/);
  has(/related concept “ghost”/);
});

test('missing Bulgarian is a note, not an error', () => {
  const d = empty();
  d.places.push(place({ bg: undefined }));
  const { errors, warnings } = validate(d, index);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
});
