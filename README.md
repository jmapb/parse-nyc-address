# Parse-nyc-address

**parse-nyc-address** provides a parseNycAddress() function which takes unstructured New York City address text and returns an object with parsed address fields "housenumber", "street", "borough", and "postcode". Unlike typical street address parsers, it will *not* return city and state fields.

A demo is available at https://jmapb.github.io/parse-nyc-address/.

This parser is optimized for researching NYC properties with minimal freeform text searches of housenumber, street, and optionally borough. Commas in the input are treated as generic whitespace. It handles many common abbreviations and attempts to detect street names even when the street type is omitted.

parseNycAddress() was developed for use with the City's open data tools and APIs such as:<br>
GOAT https://a030-goat.nyc.gov/goat<br>
GeoSearch https://geosearch.planninglabs.nyc<br>
Geoservice https://geoservice.planning.nyc.gov

The parsing logic is designed around addresses as recorded in New York City's "PAD" file (Propery Address Directory, downloadable from:
https://www.nyc.gov/site/planning/data-maps/open-data.page#other).
It will return output in ALL CAPS, like the addresses in the PAD file. Many addresses in the PAD are actually placenames, which are listed under the "stname" (street name) field with no housenumber. Therefore this parser will return any otherwise-unparsed text as part of the street field in the output, even if no housenumber is found.

The borough, if found, will be returned as a digit from 1 to 5. (1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island.) Neighborhood and borough names are not returned.

Examples:
```
parsed_addr1 = parseNycAddress("123 broadway");
// {"housenumber":"123", "street":"BROADWAY"}`
parsed_addr2 = parseNycAddress("655 FRONT A ST ANNS AVENUE);
// {"housenumber":"655 FRONT A", "street":"ST ANNS AVENUE"}
parsed_addr3 = parseNycAddress("30 cranberry bk");
// {"housenumber":"30", "street":"CRANBERRY", "borough":3}
parsed_addr4 = parseNycAddress("189 1/2 A Beach 25th St Far Rockaway");
// {"housenumber":"189 1/2 A", "street":"BEACH 25TH ST", "borough":4}
parsed_addr5 = parseNycAddress("30 Cranberry Court Staten Island NY 10309 USA");
// {"housenumber":"30", "street":"CRANBERRY COURT", "borough":5, "postcode":"10309"}
```

parseNycAddress() can take full postal addresses with zip codes, but *cannot* handle addresses with an addressee (eg a person's name).

It also *cannot* handle apartment, suite, or other unit number styles. It will likely return them as part of the street name.

It is *not* useful for testing if a given address is in NYC -- even if it returns a borough code. Eg, it might return 1 (Manhattan) for addresses in the state of Minnesota, or 4 (Queens) for addresses in the country of Jamaica. It does no validation on the data, but merely reports what the address components and borough would be *if* the input text were a valid NYC address.

Please report any issues to https://github.com/jmapb/parse-nyc-address/issues. Thanks to MxxCon for assistance with Queens neighborhood names!
