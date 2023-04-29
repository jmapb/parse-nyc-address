/* parseNycAddress() takes unstructured New York City address text and returns an object with parsed
   address fields "housenumber", "street", "borough", and "postcode". Unlike typical street address
   parsers, it will *not* return city and state fields.

   This parser is optimized for researching NYC properties with minimal freeform text searches of
   housenumber, street, and optionally borough. Commas in the input are treated as generic
   whitespace. It handles many common abbreviations and attempts to detect street names even when
   the street type is omitted.

   parseNycAddress() is designed to be used in conjunction with the City's open data tools and APIs
   such as GOAT: https://a030-goat.nyc.gov/goat
   GeoSearch: https://geosearch.planninglabs.nyc
   Geoservice: https://geoservice.planning.nyc.gov

   The parsing logic is designed around addresses as recorded in New York City's "PAD" file
   (Propery Address Directory, downloadable from:
   https://www.nyc.gov/site/planning/data-maps/open-data.page#other)
   It will return output in ALL CAPS, like the addresses in the PAD file. Many addresses in the PAD
   are actually placenames, which are listed under the "stname" (street name) field with no
   housenumber. Therefore this parser will return any otherwised-unparsed text as part of the
   street field in the output, even if no housenumber is found.

   The borough, if found, will be returned as a digit from 1 to 5. (1=Manhttan, 2=Bronx, 3=Brooklyn,
   4=Queens, 5=Staten Island.) Neighborhood and borough names are not returned.

   Examples:

   parseNycAddress("123 broadway") ->
       {"housenumber":"123", "street":"BROADWAY"}
   parseNycAddress("655 FRONT A ST ANNS AVENUE) ->
       {"housenumber":"655 FRONT A", "street":"ST ANNS AVENUE"}
   parseNycAddress("30 cranberry bk") ->
       {"housenumber":"30", "street":"CRANBERRY", "borough":3}
   parseNycAddress("189 1/2 A Beach 25th St Far Rockaway") ->
       {"housenumber":"189 1/2 A", "street":"BEACH 25TH ST", "borough":4}
   parseNycAddress("30 Cranberry Court Staten Island NY 10309 USA") ->
       {"housenumber":"30", "street":"CRANBERRY COURT", "borough":5, "postcode":"10309"}

   parseNycAddress() can take full postal addresses with zip codes, but *cannot* handle addresses
   with an addressee (eg a person's name).

   It also *cannot* handle apartment, suite, or other unit number styles. It will likeley return
   them as part of the street name.

   It is *not* useful for testing if a given address is in NYC -- even if it returns a borough code.
   Eg, it might return 1 (Manhattan) for addresses in the state of Minnesota, or 4 (Queens) for
   addresses in the country of Jamaica. It does no validation on the data, but merely reports what
   the address components and borough would be *if* the input text were a valid NYC address.

   Please report any issues to https://github.com/jmapb/parse-nyc-address/issues.  Thanks to MxxCon
   for assistance with Queens neighborhood names!
 */
 


const parseNycAddress = function(input) {

    function wholeStringMatchesPattern(str, pattern) {
        let regex = new RegExp('^' + pattern + '$');
        return regex.test(str);
    }

    const output = {};
    let marbleHill = false;

    //------------------------------------
    //STEP 1 -- Tokenize the input string
    //------------------------------------

    /* saintNames are saints that NYC streets are named after. The tokenizer will return a
       multi-word token for "ST " or "ST. " followed by any of these, to help prevent
       ambiguity in the housenumber/street boundary with addresses like:
       90 FRONT ST JAMES PLACE
       80 FRONT STREET
       1330 B STREET
       655 FRONT A ST ANNS AVENUE
       607 REAR A ST JOHNS PLACE
       1307 REAR A STREET
       (These are all real addresses from the PAD file.)

       The tokenizer will combine ST followed by a saint name into a single token, allowing
       street names like A STREET, B STREET, and FRONT STREET to be correctly parsed even if
       abbreviated to ST.

       Note that some saint streets include a possessive S suffix, some don't, and some are
       found in both forms: ST ANNS AVENUE, ST CLAIR PLACE, ST JOHN AVENUE, ST JOHNS AVENUE.
       All saints are listed without the S here, and '?S? will be added to the regex.

       Also note 'ALBAN' in this list refers to Saint Albans Place in Staten Island, but SAINT
       ALBANS is also a Queens neighborhood which serves as a city name in postal addresses. All
       such multi-word Queens neighborhoods are listed in the boroRegexes below & tokenized as
       part of the boro detection code, but the saints are tokenized before the boros so search
       text including "ST ALBANS" as an abbreviated postal city will be caught by this list
       instead. This is not a problem!
     */
    const saintNames = ['ADALBERT', 'ALBAN', 'ANDREW', 'ANN', 'ANTHONY', 'AUSTIN', 'CHARLES',
        'CLAIR', 'EDWARD', 'FELIX', 'FRANCIS', 'GEORGE', 'JAMES', 'JOHN', 'JOSEPH', 'JUDE',
        'JULIAN', 'LAWRENCE', 'LUKE', 'MARK', 'MARY', 'NICHOLAS', 'OUEN', 'PATRICK', 'PAUL',
        'PETER', 'RAYMOND', 'STEPHEN', 'THERESA'];

    /* boroRegexes are multi-word patterns that indicate a particular boro, and are listed by the
       NYC boro code. Like the saints, these also need to be combined into single multi-word
       tokens so the boro can be identified and separated from the street address tokens.

       Boro 4 (Queens) has a long list of possible patterns because postal addresses in Queens use
       local neighborhood names instead of the boro name.

       We also use codes 6 and 7, which are outside the usual range for boros. 6 is used for generic
       "New York" and similar, which we will interpret as Manhattan if no better boro info can be
       found. 7 is used for "United States" and similar which contains no boro information but, like
       the boro patterns, needs to be popped off the end of the input string during parsing.

       (Single-word boro indicators like "Manhattan" and "Brooklyn", and the single-word Queens
       neighborhoods, are listed below in step 3, in the simpleBoros object.)
     */
    const boroRegexes =  { 1: ['MARBLE ?HI?L?L'], //Allow sneaky Marble Hill override (see Step 4)
                           2: ['THE ?B(RO)?N?X'],
                           4: ['ADDISLEIGH ?PA?R?K', 'BAYSIDE ?HI?L?LS?', 'BELLE? ?HA?RB(OR)?',
                               'BELLE?ROSE( MANOR)', 'BREEZY ?P(OI)?N?T', 'BR(OA)?D ?CHAN(NEL)?',
                               'CAMBRIA ?H(EI)?(GH)?TS?', 'COLLEGE ?P(OI)?N?T', 'E(AST)? ?ELMHURST',
                               'FA?R ?ROCKAWAY', 'FO?RE?ST ?HI?L?LS?', 'F(OR)?T ?TILDEN',
                               'FRE?SH ?M(EA)?DO?WS', 'HOLLIS ?HI?L?LS?', 'HOWARD ?B(EA)?CH',
                               'JACKSON ?H(EI)?G?H?TS?', '(JOHN F.? )?KENNEDY AIRPO?R?T',
                               'JFK ?AIRPO?R?T', 'KEW ?GA?RDE?NS?( HI?L?LS?)?', 'LITTLE ?NE?CK',
                               'LA ?GUARDIA AIRPO?R?T', 'L(ONG)? ?IS?(LAND)? ?CITY',
                               'MID(DLE)? ?VI?L(LA)?GE?', 'OAKLA?ND ?GA?RDE?NS?',
                               '(S(OUTH)? )?OZONE ?PA?R?K', 'Q(UEE)?NS ?VI?L(LA)?GE?',
                               'REGO ?PA?R?K', '(S(OUTH)? )?RICHMOND ?HI?L?LS?',
                               'ROCHDALE ?VI?L(LA)?GE?', 'ROCKAWAY ?B(EA)?CH', 'ROCKAWAY ?PA?R?K',
                               'ROCKAWAY ?P(OI)?N?T', 'S(AIN)?T ?ALBANS?',
                               'SPRINGFIELD ?GA?RDE?NS?', 'WAVE ?CRE?ST'],
                           5: ['STATEN ?ISL?(AND)?'],
                           6: ['NEW ?YORK( CITY)?', 'NY ?CITY'],
                           7: ['UNITED STATES( OF AMERICA)'] };

    /* Combine the saintNames and boroRegexes along with a few other special cases into a long regex
       string, which ends with \S to catch the remaining single word tokens.
       Match this against a cleaned-up version of the input string to yield the tokens list.
     */
    const multiWordTokens = saintNames.map(x => "ST\\.? " + x + "'?S?").concat( ['AVE?(NUE)? OF',
        '(BMT.Q.)?AVE?(NUE)? \\w', 'FRONT STR(EET)?', '\\w STR(EET)?', 'FRONT R(OA)?D',
        '\\w R(OA)?D', 'OF NEW ?YORK', 'OF NY', 'OF MANHATTAN', 'OF THE ?BRONX', 'OF BROOKLYN',
        'OF Q(UEE)?NS', 'CE?N?TE?R Q(UEE)?NS', 'OF STATEN ?ISL?(AND)?', 'OF SI', 'PS.?IS 78 Q',
        'HA?R?BO?R BU?I?LDI?N?G Q'], Object.values(boroRegexes).flat());
    let tokenizerRegex = new RegExp('\\b' + multiWordTokens.join('\\b|\\b') + '\\b|\\S+', 'g');
    let tokens = input.replace(/[\s,]+/g, " ").trim().toUpperCase().match(tokenizerRegex) ?? [];
    //consider also sanitizing angled single quotes, in case they make their way into possessives


    //-----------------------------------------------------------
    //STEP 2 -- Count how many tokens are part of the housenumber
    //-----------------------------------------------------------

    /* The NYC PAD file considers suffixes like 1/2, 1/3, GARAGE, REAR, and some strange things like
       AIR RIGHTS to be part the houseumber. housenumberTokens lists all tokens that are 1) valid in
       housenumbers and 2) will never be the first token of a street name that follows a housenumber.
       (There are currently no housenumbers with 2/3 or 3/4 but they're included just in case.)
     */
    const housenumberTokens = ['GAR', 'GARAGE', 'REAR', 'AA', 'AB', 'AF', 'AS', 'BA', 'BB',
        'CE', 'ED', 'SF', '1/2', '1/3', '2/3', '1/4', '3/4', 'INT', 'INTER', 'UNDER',
        'UNDRGRND', 'UNDERGROUND', 'AIR', 'RIGHT', 'RIGHTS', 'RGHT', 'RGHTS', 'RGT', 'RGTS',
        'E-BLDG', 'W-BLDG'];

    /* ambiguousTokens lists all tokens that are valid in housenumbers but may also be first token
       of a street name that follows a housenumber, like "B ROAD" or "FRONT STREET".
     */
    const ambiguousTokens = ['A', 'B', 'C', 'D', 'FRONT'];

    let housenumberTokenCount = 0;
    /* If the first token begins with a digit, there is at least one housenumber token. Loop
       through the subsequent tokens to see how many more are part of the housenumber.

       If the last token is ambiguous (might be part of the street name) don't include it in
       the housenumberTokenCount for now. Later, after eliminating any boro or postal code
       tokens, we'll take another look and maybe append that ambiguous token to the
       housenumber.
     */
    if ((tokens[0] ?? '').search(/\d/) === 0) {
        housenumberTokenCount = 1;
        while (housenumberTokenCount < tokens.length) {
            if ( housenumberTokens.includes(tokens[housenumberTokenCount])
                 || (ambiguousTokens.includes(tokens[housenumberTokenCount])
                     && housenumberTokens.concat(ambiguousTokens).includes(tokens[housenumberTokenCount+1] ?? '')) ) {
                housenumberTokenCount++
            } else {
                break;
            }
        }
    }


    //--------------------------------------------------------------------------------
    //STEP 3 -- Try to determine the borough, and remove any recognized borough, city,
    //          state, country, and zip code tokens from the end of the token list
    //--------------------------------------------------------------------------------


    let boro = 9; 
    let zipBoro = 9;
    /* In addition to standard boro codes 1-5, we use 9 to mean unknown, 7 to mean inconclusive,
       and 6 to mean that Manhattan will be a fallback if no more specific info is found. We
       avoid any values < 1 so we can test for a valid boro with < 6.
     */
    let foundNy = false;
    let postcode = '';
    const simpleBoros = { 'MANHATTAN': 1, 'M': 1,'MA': 1,'MH': 1, 'MN': 1,
                          'BRONX': 2, 'BX': 2, 'BRX': 2, 'BRON': 2,
                          'BROOKLYN': 3, 'BK': 3, 'BRK': 3, 'BKLYN': 3, 'BRKLYN': 3,
                          'QUEENS': 4, 'Q': 4, 'QU': 4, 'QN': 4, 'QNS': 4, 'ARVERNE': 4,
                          'ASTORIA': 4, 'AUBURNDALE': 4, 'BAYSIDE': 4, 'BEECHHURST': 4,
                          'BRIARWOOD': 4, 'CORONA': 4, 'DOUGLASTON': 4, 'EDGEMERE': 4,
                          'ELMHURST': 4, 'FLUSHING': 4, 'GLENDALE': 4, 'HOLLIS': 4, 'JAMAICA': 4,
                          'LAURELTON': 4, 'LIC': 4, 'MALBA': 4, 'MASPETH': 4, 'NEPONSIT': 4,
                          'RIDGEWOOD': 4, 'ROSEDALE': 4,  'SUNNYSIDE': 4, 'WHITESTONE': 4,
                          'WOODHAVEN': 4, 'WOODSIDE': 4,
                          'SI': 5,
                          'NY': 6, 'NYNY': 6, 'NYC': 6,
                          'US': 7, 'USA': 7 };
    const zipPrefixBoros = { 100: 1, 101: 1, 102: 1,
                             104: 2,
                             112: 3,
                             111: 4, 113: 4, 114: 4, 116: 4,
                             103: 5 };
 
    /* Loop backwards through the tokens looking for boro names */
    while (tokens.length - housenumberTokenCount > 1) { //make sure we leave at least one token for steet, even if it looks like a boro
        finalToken = tokens[tokens.length - 1] ?? '';
        if (zipBoro === 9) {
            const zipMatches = /^(\d\d\d)\d\d/.exec(finalToken);
            if (Array.isArray(zipMatches)) {
                postcode = finalToken;
                zipBoro = zipPrefixBoros[zipMatches[1]] ?? 7;
                tokens.pop();
                continue;
            }
        }
        boro = simpleBoros[finalToken] ?? 9;
        if (boro === 9) {
            for (const boroKey in boroRegexes) {
                if (boroRegexes[boroKey].some((p) => wholeStringMatchesPattern(finalToken, p))) {
                    boro = parseInt(boroKey);
                    break;
                }
            }
            if (boro === 9) {
                break;
            }
        }
        if (boro === 6) {
            foundNy = true;
        }
        tokens.pop();
        if (boro < 6) {
            break;
        }
    }

    //We could let users set the boro code directly in the search text (eg "123 Broadway 1")... but
    //only if a housenumber is present, because many of the unnumbered placenames end with single
    //digits.

    //Some placenames also end with tokens like "OF MANHATTAN", "OF QUEENS", "CTR QNS", "OF SI"
    //which unambiguously specify the boro. We could check for those as well.

    if (boro > 5) {
        if (zipBoro < 6) {
            boro = zipBoro;
        } else if (foundNy) {
            //Fall back to Manhattan if "New York" etc was found, but no other boro name
            boro = 1;
        }
    }


    //-----------------------------------------------------------------------------------
    //STEP 4 -- Finalize housenumber and street fields, do Marble Hill checks, and return
    //-----------------------------------------------------------------------------------

    /* If there is at least one housenumber token, add housenumber field to the output. */
    if (housenumberTokenCount > 0) {
        /* As mentioned in the Step 2 comments, if there are multiple street name tokens, and the
           first token of the street name is an "ambiguous" token (A/B/C/D/FRONT), we might want
           to move this token from the street name to the housenumber, before assembling the
           housenumber output field -- but only if the next token after it does *not* look like a
           street type.

           We don't need to check for STR/STREET/RD/ROAD because the tokenizer will combine
           ambiguous tokens followed by these street types into a single token in Step 1. But it
           won't do this with ST./ST (to avoid interfering with saint name tokenization) or with
           AV/AVE/AVENUE (to avoid interfering with AVENUE A/B/C/etc tokenization) so we'll
           check those here.

           These are the only street types necessary to avoid ambiguity given the current list
           of NYC addresses found in the PAD file. It might be good practice to check against a
           more complete list of street types, but look out for tricky ones like LANE AVENUE,
           PLAZA DRIVE/PLACE/STREET, and BOULEVARD which is a single-word road name in Malba,
           Queens.

           (If there's only a single street token, leave it for the street no matter what it is.
           Presumably, a search like "100 FRONT" is more likely looking for housenumber 100 on
           FRONT STREET than houseumber "100 FRONT" with no street specified.)
         */
        if ((tokens.length - housenumberTokenCount > 1)
            && ambiguousTokens.includes(tokens[housenumberTokenCount] ?? '')
            && !['ST','ST.','AV','AVE','AVENUE'].includes(tokens[housenumberTokenCount+1] ?? '')) {
            housenumberTokenCount++;
        }

        /* Assemble the housenumber output string */
        let housenumberText = tokens.slice(0, housenumberTokenCount).join(' ');
        if (housenumberText !== '') {
            output['housenumber'] = housenumberText;
        }
    }

    /* Assemble all remaining tokens as the street output string */
    let streetText = tokens.slice(housenumberTokenCount).join(' ');
    if (streetText !== '') {
        output['street'] = streetText;
    }

    /* Add boro output string, if found. If boro is Bronx, do Marble Hill checks first. */
    if (boro < 6) {
        if (boro === 2) {
        /* Marble Hill is a small neighborhood on the Bronx side of the Harlem River that's
           actually part of New York County & the borough of Manhattan... BUT whose correct
           postal addresses use Bronx, NY and a Bronx zip code (10463).

           There's a MARBLE HILL boro 1 override in boroRegexes, in case someone searches using the
           neighborhood name -- not really correct, but might happen. Input could also just specify
           Manhattan (which is correct) or MH, which is a handy shorthand for Manhattan that one
           could also pretend stood for Marble Hill. Or even just M -- we'll assume any of these
           are boro=1.

           But since we also want to support postal addresses, which should say Bronx, we need to
           know which Bronx addresses are actually Marble Hill addresses to return 1 instead of 2.

           Querying the PAD file for zip 10463 reveals some streets (and placenames residing in the
           stname field) that are entirely within borough 1. For other street names we'll examine
           the housenumber and set the borough to 1 if it lies within the range of addresses in
           Marble Hill.
         */
            const marbleHillStreetRegexes = ['ADRIAN AVE?(NUE)?', 'FO?R?T CHARLES PL(ACE)?',
                'JACOBUS PL(ACE)?', 'MARBLE HI?L?L AVE?(NUE)?', 'MARBLE HI?L?L LA?NE?',
                'TERRACE VIEW AVENUE', 'VAN CORLEAR PLACE',  'W(EST)? 22[58](TH)?( STR?(EET)?)?',
                'METRO NORTH-MARBLE HI?L?L', , 'MARBLE HI?L?L HOUSES B(UI)?LDI?N?G [1-37-9]',
                'MARBLE HI?L?L HOUSES( B(UI)?LDI?N?G 10)?', 'ATMOSPHERE CHARTER SCH(OO)?L?',
                'MARBLE HI?L?L HOUSES CHILDRENS? CE?N?TE?R', '(THE )?SHOPS AT MARBLE HI?L?L',
                'IRT-1-MARBLE HI?L?L-225 STREET', 'BROADWAY BRI?DGE?'];
            if (marbleHillStreetRegexes.some((p) => wholeStringMatchesPattern(streetText, p))) {
                marbleHill = true;
            } else if (housenumberTokenCount > 0) {
                housenumberInt = parseInt(tokens[0]);
                if (housenumberInt > 0) {
                    if ( ((streetText === 'BROADWAY')
                          && ((housenumberInt === 5485) || ((housenumberInt >= 5170) && (housenumberInt <= 5480))))
                        || ((housenumberInt < 200) && /22[578](TH)? ST/.test(streetText)) ) {
                        marbleHill = true;
                    }
                }
            }
            if (marbleHill) {
                boro = 1;
            }  
        }   
        output['borough'] = boro;
        if (marbleHill) {
            output['marble_hill'] = true; 
        }
    }

    /* Add postcode output string, if found */
    if (postcode !== '') {
        output['postcode'] = postcode;
    }

    return output;
}

module.exports = parseNycAddress;