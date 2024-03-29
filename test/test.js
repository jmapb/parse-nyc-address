const test = require('tape');
const parseNycAddress = require('../dist/parse-nyc-address.js');

test('Housenumber plus one-word street', function(t) {
  const p = parseNycAddress('123 broadway');
  t.equal(p.housenumber, '123');
  t.equal(p.street, 'BROADWAY');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('Housenumber with suffix plus multi-word street', function(t) {
  const p = parseNycAddress('55 D DR M L KING JR BOULEVARD');
  t.equal(p.housenumber, '55 D');
  t.equal(p.street, 'DR M L KING JR BOULEVARD');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('All-digit housenumber followed by all-digit street', function(t) {
  const p = parseNycAddress('72 18');
  t.equal(p.housenumber, '72');
  t.equal(p.street, '18');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('Housenumber, street whose name looks like a housenumber suffix, irregular borough name', function(t) {
  const p = parseNycAddress('1010 D STREET THE BRONX');
  t.equal(p.housenumber, '1010');
  t.equal(p.street, 'D STREET');
  t.equal(p.borough, 2);
  t.end();
});

test('Housenumber plus street with an abbreviated directional prefix', function(t) {
  const p = parseNycAddress('8 E BROADWAY');
  t.equal(p.housenumber, '8');
  t.equal(p.street, 'E BROADWAY');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('Housenumber with suffix plus street name with street/saint ambiguity', function(t) {
  const p = parseNycAddress('90 FRONT ST JAMES PLACE');
  t.equal(p.housenumber, '90 FRONT');
  t.equal(p.street, 'ST JAMES PLACE');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('Housenumber with two suffixes plus street name with street/saint ambiguity', function(t) {
  const p = parseNycAddress('655 FRONT A ST ANNS AVENUE');
  t.equal(p.housenumber, '655 FRONT A');
  t.equal(p.street, 'ST ANNS AVENUE');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('Housenumber with two suffixes, type-prefixed street, abbreviated borough', function(t) {
  const p = parseNycAddress('82 REAR A AVENUE A MH');
  t.equal(p.housenumber, '82 REAR A');
  t.equal(p.street, 'AVENUE A');
  t.equal(p.borough, 1);
  t.end();
});

test('Housenumber, street without type, abbreviated borough', function(t) {
  const p = parseNycAddress('30 cranberry bk');
  t.equal(p.housenumber, '30');
  t.equal(p.street, 'CRANBERRY');
  t.equal(p.borough, 3);
  t.end();
});

test('Housenumber with suffix, street whose name looks like a housenumber suffix, various newline chars', function(t) {
  const p = parseNycAddress('1307 \r \r \r REAR\r\nA\r\n\r\nST...');
  t.equal(p.housenumber, '1307 REAR');
  t.equal(p.street, 'A ST');
  t.equal(p.hasOwnProperty('borough'), false);
  t.end();
});

test('Housenumber with two suffixes, street name with prefix, borough specified by neighborhood name', function(t) {
  const p = parseNycAddress('189 1/2 A Beach 25th St Far Rockaway');
  t.equal(p.housenumber, '189 1/2 A');
  t.equal(p.street, 'BEACH 25TH ST');
  t.equal(p.borough, 4);
  t.end();
});

test('Full postal address with zip code and country', function(t) {
  const p = parseNycAddress('30 Cranberry Court Staten Island NY 10309 USA');
  t.equal(p.housenumber, '30');
  t.equal(p.street, 'CRANBERRY COURT');
  t.equal(p.borough, 5);
  t.equal(p.postcode, '10309');
  t.end();
});

test('Housenumber and street in Marble Hill, returns borough 1 despite having a Bronx postal address', function(t) {
  const p = parseNycAddress('2 Jacobus Pl., Bronx, New York');
  t.equal(p.housenumber, '2');
  t.equal(p.street, 'JACOBUS PL');
  t.equal(p.borough, 1);
  t.equal(p.marble_hill, true);
  t.end();
});

test('Building on the Marble Hill side of the Marble Hill Houses', function(t) {
  const p = parseNycAddress('marble hill houses bldg 1');
  t.equal(p.street, 'MARBLE HILL HOUSES BLDG 1');
  t.equal(p.borough, 1);
  t.equal(p.marble_hill, true);
  t.end();
});

test('Building on the Bronx side of the Marble Hill Houses', function(t) {
  const p = parseNycAddress('marble hill houses bldg 11');
  t.equal(p.street, 'MARBLE HILL HOUSES BLDG 11');
  t.equal(p.borough, 2);
  t.equal(p.hasOwnProperty('marble_hill'), false);
  t.end();
});