# parse-nyc-address

Parse-nyc-address provides a parseNycAddress() function which takes unstructured New York City address text and returns an object with parsed address fields "housenumber", "street", "borough", and "zip".

A demo is available at https://jmapb.github.io/parse-nyc-address/.

This parser is optimized for researching NYC properties with minimal freeform text searches of housenumber, street, and optionally borough. Commas in the input will be treated as generic whitespace. It handles many common abbreviations and attempts to detect the street names even when the street type is omitted.

parseNycAddress is designed to be used in conjunction with the City's online tools and APIs such
as GOAT: https://a030-goat.nyc.gov/goat
GeoSearch: https://geosearch.planninglabs.nyc
Geoservice: https://geoservice.planning.nyc.gov

The parsing logic is designed around addresses as recorded in New York City's "PAD File" (Propery Address Directory, downloadable from:
https://www.nyc.gov/site/planning/data-maps/open-data.page#other )
It will return output in ALL CAPS, like the addresses in the PAD file. Many addresses in the PAD file are actually placenames, which are listed under the "stname" (street name) field with no housenumber. Therefore this parser will return any otherwised-unparsed text as part of the street field in the output, even if no housenumber is found.

The borough, if found, will be returned as a digit from 1 to 5. (1=Manhttan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island.)

parseNycAddress can take full postal addresses with zip codes, but *cannot* handle addresses with an addressee (eg a person's name).

It also *cannot* handle appartment, suite, or other unit number styles. It will likeley return them as part of the street name.

It is *not* useful for testing if a given address is in NYC -- even if it returns a borough code. Eg, it might return 1 (Manhattan) for addresses in the state of Minnesota, and 4 (Queens) for addresses in the country of Jamaica.

Please report any issues to https://github.com/jmapb/parse-nyc-address/issues
