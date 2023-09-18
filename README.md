# Parse-nyc-address

**parse-nyc-address** provides a parseNycAddress() function which takes unstructured New York City address text and returns an object with parsed address fields like **housenumber**, **street**, **postcode**, and, very importantly, **borough** -- proper detection of the borough is vital for working with NYC address data. Unlike typical street address parsers, it will *not* return city and state fields.

A demo is available at https://jmapb.github.io/parse-nyc-address/. Releases are published on NPM at https://www.npmjs.com/package/parse-nyc-address.

This parser is optimized for researching NYC properties with minimal searches in the form "HOUSENUMBER STREET" or "HOUSENUMBER STREET BOROUGH", but it can also take full postal addresses with city, state, and zip code. Commas and line separators in the input are treated as generic whitespace, and periods preceding whitespace are ignored. The parser handles many common abbreviations and attempts to detect street names even when the street type is omitted.

parseNycAddress() was developed for use with the City's open data tools and APIs such as:<br>
GOAT https://a030-goat.nyc.gov/goat<br>
GeoSearch https://geosearch.planninglabs.nyc<br>
Geoservice https://geoservice.planning.nyc.gov<br>

The parsing logic is designed around addresses as recorded in New York City's "PAD" file (Property Address Directory, downloadable from:
https://www.nyc.gov/site/planning/data-maps/open-data.page#other)
It will return output in ALL CAPS, like the addresses in the PAD file. Many of these addresses are actually placenames, which are listed in the PAD's "stname" (street name) field with no housenumber. Therefore this parser will return any otherwise-unparsed text as part of the street field in the output, even if no housenumber is found.

The borough, if found, will be returned as a digit from 1 to 5. (1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island.) Neighborhood and borough names are not returned, but special consideration is given for Marble Hill, an anomalous neighborhood on the Bronx side of the Harlem River. It is legally in the borough of Manhattan, but its correct postal addresses include "Bronx, NY" and a Bronx zip code. This parser will return **"borough":1** for Marble Hill addresses, even when the input text specifies the borough as Bronx -- and for clarity, will also tag them with  **"marble_hill":true**.

Examples:
```
parsed1 = parseNycAddress("123 broadway");
// {"housenumber":"123", "street":"BROADWAY"}`
parsed2 = parseNycAddress("655 FRONT A ST. ANNS AVENUE");
// {"housenumber":"655 FRONT A", "street":"ST ANNS AVENUE"}
parsed3 = parseNycAddress("30 cranberry bk");
// {"housenumber":"30", "street":"CRANBERRY", "borough":3}
parsed4 = parseNycAddress("189 1/2 A Beach 25th St Far Rockaway");
// {"housenumber":"189 1/2 A", "street":"BEACH 25TH ST", "borough":4}
parsed5 = parseNycAddress("30 Cranberry Court Staten Island NY 10309 USA");
// {"housenumber":"30", "street":"CRANBERRY COURT", "borough":5, "postcode":"10309"}
parsed6 = ("2 Jacobus Pl., Bronx, New York");
// {"housenumber":"2", "street":"JACOBUS PL", "borough":1, "marble_hill":true}
```

parseNycAddress() can take full postal addresses with zip codes, but *cannot* handle addresses with an addressee (eg a person's name).

It also *cannot* handle apartment, suite, or other unit number styles. It will likely return them as part of the street name.

It is *not* useful for testing if a given address is in NYC -- even if it returns a borough code. Eg, it might return 1 (Manhattan) for addresses in the state of Minnesota, or 4 (Queens) for addresses in the country of Jamaica. It does no validation on the data, but merely reports what the address components and borough would be *if* the input text were a valid NYC address.

Please report any issues to https://github.com/jmapb/parse-nyc-address/issues. Thanks to MxxCon for assistance with Queens neighborhood names!
