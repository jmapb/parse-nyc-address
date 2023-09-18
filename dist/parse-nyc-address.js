/* parseNycAddress() takes unstructured New York City address text and returns an object with parsed
   address fields like "housenumber", "street", "postcode", and, very importantly, "borough" -- proper
   detection of the borough is vital for working with NYC address data. Unlike typical street address
   parsers, it will *not* return city and state fields.

   This parser is optimized for researching NYC properties with minimal searches in the form
   "HOUSENUMBER STREET" or "HOUSENUMBER STREET BOROUGH", but it can also take full postal
   addresses with city, state, and zip code. Commas and line separators in the input are treated as
   generic whitespace, and periods preceding whitespace are ignored. The parser handles many common
   abbreviations and attempts to detect street names even when the street type is omitted.

   parseNycAddress() is designed to be used in conjunction with the City's open data tools and APIs
   such as GOAT: https://a030-goat.nyc.gov/goat
   GeoSearch: https://geosearch.planninglabs.nyc
   Geoservice: https://geoservice.planning.nyc.gov

   The parsing logic is designed around addresses as recorded in New York City's "PAD" file
   (Property Address Directory, downloadable from:
   https://www.nyc.gov/site/planning/data-maps/open-data.page#other)
   It will return output in ALL CAPS, like the addresses in the PAD file. Many of these addresses
   are actually placenames, which are listed in the PAD's "stname" (street name) field with no
   housenumber. Therefore this parser will return any otherwise-unparsed text as part of the
   street field in the output, even if no housenumber is found.

   The borough, if found, will be returned as a digit from 1 to 5. (1=Manhattan, 2=Bronx,
   3=Brooklyn, 4=Queens, 5=Staten Island.) Neighborhood and borough names are not returned, but
   special consideration is given for Marble Hill, an anomalous neighborhood on the Bronx side
   of the Harlem River. It is legally in the borough of Manhattan, but its correct postal
   addresses include "Bronx, NY" and a Bronx zip code. This parser will return borough=1 for
   Marble Hill addresses, even when the input text specifies the borough as Bronx -- and for
   clarity, will also tag them with marble_hill=true.

   Examples:

   parseNycAddress("123 broadway") ->
       {"housenumber":"123", "street":"BROADWAY"}
   parseNycAddress("655 FRONT A ST. ANNS AVENUE") ->
       {"housenumber":"655 FRONT A", "street":"ST ANNS AVENUE"}
   parseNycAddress("30 cranberry bk") ->
       {"housenumber":"30", "street":"CRANBERRY", "borough":3}
   parseNycAddress("189 1/2 A Beach 25th St Far Rockaway") ->
       {"housenumber":"189 1/2 A", "street":"BEACH 25TH ST", "borough":4}
   parseNycAddress("30 Cranberry Court Staten Island New York 10309 USA") ->
       {"housenumber":"30", "street":"CRANBERRY COURT", "borough":5, "postcode":"10309"}
   parseNycAddress("2 Jacobus Pl., Bronx, New York") ->
       {"housenumber":"2", "street":"JACOBUS PL", "borough":1, "marble_hill":true}

   parseNycAddress() can take full postal addresses with zip codes, but *cannot* handle addresses
   with an addressee (eg a person's name).

   It also *cannot* handle apartment, suite, or other unit number styles. It will likely return
   them as part of the street name.

   It is *not* useful for testing if a given address is in NYC -- even if it returns a borough code.
   Eg, it might return 1 (Manhattan) for addresses in the state of Minnesota, or 4 (Queens) for
   addresses in the country of Jamaica. It does no validation on the data, but merely reports what
   the address components and borough would be *if* the input text were a valid NYC address.

   Please report any issues to https://github.com/jmapb/parse-nyc-address/issues. Thanks to MxxCon
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
       multi-word token for ST followed by any of these, to help prevent ambiguity in the
       housenumber/street boundary
       with addresses like:
       90 FRONT ST JAMES PLACE
       80 FRONT STREET
       1330 B STREET
       655 FRONT A ST ANNS AVENUE
       607 REAR A ST JOHNS PLACE
       1307 REAR A STREET
       (These are all real addresses from the PAD file.)

       The tokenizer will combine "ST " (or "ST. ", since periods preceding whitespace are
       stripped) followed by a saint name into a single token, allowing street names like
       A STREET, B STREET, and FRONT STREET to be correctly parsed even if abbreviated to ST.
       There's no need to combine the full word SAINT followed by a saint name into a single
       token, because only the abbreviated form causes ambiguity.

       Note that some saint streets include a possessive S suffix, some don't, and some are
       found in both forms: ST ANNS AVENUE, ST CLAIR PLACE, ST JOHN AVENUE, ST JOHNS AVENUE.
       Input text, of course, will sometimes include the S suffix when it shouldn't be there
       and omit it when it should. All saints are listed without the S here, and '?S? will
       be added to the regex so we can match either form.

       Also note 'ALBAN' in this list refers to the road Saint Albans Place in Staten Island, but
       SAINT ALBANS is also a Queens neighborhood which serves as a city name in postal addresses.
       All such multi-word Queens neighborhoods are listed in the boroRegexes below & tokenized as
       part of the boro detection code, but the saints are tokenized before the boros so input
       text including "ST ALBANS" as an abbreviated postal city will be caught by this list
       instead. This is not a problem, and the boro detection will still work.
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
    const boroRegexes =  { 1: ['MARBLE ?HI?L?L'], //Allow iffy Marble Hill -> Manhattan mapping (see Step 4)
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
        '\\w R(OA)?D', 'OF NEW ?YORK', 'OF NY', 'OF MANHATTAN', 'OF THE ?BRONX', 'OF BR?(OO)?KLYN',
        'OF Q(UEE)?NS', 'CE?N?TE?R Q(UEE)?NS', 'OF STATEN ?ISL?(AND)?', 'OF SI', 'PS.?IS 78 Q',
        'HA?R?BO?R BU?I?LDI?N?G Q', 'AIR TRAIN[-A-Z]*', 'ED KOCH', 'UNDER THE'], Object.values(boroRegexes).flat());
    const tokenizerRegex = new RegExp('\\b' + multiWordTokens.join('\\b|\\b') + '\\b|\\S+', 'g');
    const tokens = input.replace(/\.*[\s,]+|\.+$/g, " ").trim().toUpperCase().match(tokenizerRegex) ?? [];
    //consider also sanitizing angled single quotes, in case they make their way into possessives


    //-----------------------------------------------------------
    //STEP 2 -- Count how many tokens are part of the housenumber
    //-----------------------------------------------------------

    /* The NYC PAD file considers suffixes like 1/2, 1/3, GARAGE, REAR, and some strange
       things like AIR RIGHTS to be part the housenumber. housenumberTokens lists all tokens
       that are 1) valid in housenumbers and 2) will never be the first token of a street
       name that follows a housenumber. (There are currently no housenumbers with 2/3 or 3/4
       but they're included just in case.)
     */
    const housenumberTokens = ['GAR', 'GARAGE', 'REAR', 'AA', 'AB', 'AF', 'AS', 'BA', 'BB',
        'CE', 'ED', 'SF', '1/2', '1/3', '2/3', '1/4', '3/4', 'INT', 'INTER', 'UNDER',
        'UNDRGRND', 'UNDERGROUND', 'AIR', 'RIGHT', 'RIGHTS', 'RGHT', 'RGHTS', 'RGT', 'RGTS',
        'E-BLDG', 'W-BLDG'];

    /* ambiguousTokens lists all tokens that are valid in housenumbers but may also be first
       token of a street name that follows a housenumber, like "B ROAD" or "FRONT STREET".
     */
    const ambiguousTokens = ['A', 'B', 'C', 'D', 'FRONT'];

    let housenumberTokenCount = 0;
    /* If the first token begins with a digit, there is at least one housenumber token. Loop
       through the subsequent tokens to see how many more are part of the housenumber.

       If the last token is ambiguous (might be part of the street name) don't include it in
       the housenumberTokenCount for now. Later, after eliminating any boro or postal code
       tokens, we'll take another look and maybe append that ambiguous token to the
       housenumber after all.

       Note: Only tokens included in the housenumberTokens and ambiguousTokens lists are considered
       valid as subsequent parts of a housenumber. If the parser encounters any other token, even
       one that's all digits, that will be considered part of the street. So the input string
       "72 18" would return "72" as the housenumber and "18" as the street, which is good because
       this might be shorthand for 72 18th Street. But input "72 18 Broadway" would return "72" as
       the housenumber and "18 Broadway" as the street -- which isn't good if this input is trying
       to specify "72-18 Broadway", a valid address in Queens with a hyphenated housenumber. (It's
       quite common to see Queens addresses omit these hyphens, eg "7218 Broadway", but it's also
       reasonably common to see them written with a space in place of the hyphen.) So this might
       be an area for future improvement, if we want to support this addressing style.
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
    const simpleBoros = { 'MANHATTAN': 1, 'M': 1, 'MA': 1, 'MH': 1, 'MN': 1, 'MAN': 1, 'MANH': 1,
                          'BRONX': 2, 'BX': 2, 'BRX': 2, 'BRON': 2,
                          'BROOKLYN': 3, 'BK': 3, 'BRK': 3, 'BKLYN': 3, 'BRKLYN': 3,
                          'QUEENS': 4, 'Q': 4, 'QU': 4, 'QN': 4, 'QNS': 4, 'ARVERNE': 4,
                          'ASTORIA': 4, 'AUBURNDALE': 4, 'BAYSIDE': 4, 'BEECHHURST': 4,
                          'BRIARWOOD': 4, 'CORONA': 4, 'DOUGLASTON': 4, 'EDGEMERE': 4,
                          'ELMHURST': 4, 'FLUSHING': 4, 'GLENDALE': 4, 'HOLLIS': 4, 'JAMAICA': 4,
                          'LAURELTON': 4, 'LIC': 4, 'MALBA': 4, 'MASPETH': 4, 'NEPONSIT': 4,
                          'RIDGEWOOD': 4, 'ROSEDALE': 4, 'SUNNYSIDE': 4, 'WHITESTONE': 4,
                          'WOODHAVEN': 4, 'WOODSIDE': 4,
                          'SI': 5,
                          'NY': 6, 'NYNY': 6, 'NYC': 6,
                          'US': 7, 'USA': 7 };
    const zipPrefixBoros = { 100: 1, 101: 1, 102: 1,
                             104: 2,
                             112: 3,
                             111: 4, 113: 4, 114: 4, 116: 4,
                             103: 5 };

    /* Loop backwards through the tokens looking for boro names and postcodes */
    let finalToken = '';
    while (tokens.length - housenumberTokenCount > 1) { //make sure we leave at least one token for street, even if it looks like a boro
        finalToken = tokens[tokens.length - 1] ?? '';
        if (zipBoro === 9) {
            const zipMatches = /^(\d\d\d)\d\d/.exec(finalToken);
            if (Array.isArray(zipMatches)) {
                /* Set postcode string to be returned by parser. Note that this is *not* just
                   the 5-digit zip match above, but the entire token -- all we know is that is
                   begins with 5 digits. So this will return full ZIP+4 style zip codes, but
                   it will also return eg '123456789' or '10000-POUNDS-OF-FEATHERS'.
                 */
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

    //We could consider supporting boro codes appended directly to the input text (eg
    //"123 Broadway 1")... but only if a housenumber is present, because many of the unnumbered
    //placenames in the PAD end with single digits.

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

           We don't need to check for STR/STREET/RD/ROAD because the tokenizer will have combined
           ambiguous tokens followed by these street types into a single token in Step 1. But it
           won't have done this with ST (to avoid interfering with saint name tokenization) or
           with AV/AVE/AVENUE (to avoid interfering with AVENUE A/B/C/etc tokenization) so we'll
           check those here.

           These are the only street types necessary to avoid ambiguity given the current list
           of NYC addresses found in the PAD file. It might be good practice to check against a
           more complete list of street types, but look out for tricky ones like LANE AVENUE and
           PLAZA DRIVE/PLACE/STREET, as well as BOULEVARD which is a single-word road name in
           Malba, Queens.

           (If there's only a single street token, leave it for the street no matter what it is.
           Presumably, a search like "100 FRONT" is more likely looking for housenumber 100 on
           FRONT STREET than housenumber "100 FRONT" with no street specified.)
         */
        if ((tokens.length - housenumberTokenCount > 1)
            && ambiguousTokens.includes(tokens[housenumberTokenCount] ?? '')
            && !['ST','AV','AVE','AVENUE'].includes(tokens[housenumberTokenCount+1] ?? '')) {
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

    /* Based on the housenumber and street we found, does this look like a Marble Hill address?

       Marble Hill is a small neighborhood on the Bronx side of the Harlem River that's actually
       part of New York County & the borough of Manhattan... BUT whose correct postal addresses
       use Bronx, NY and a Bronx zip code (10463).

       Because Marble Hill is a common point of confusion in NYC addressing, we want to add
       marble_hill=yes to the parser's output for Marble Hill addresses -- and also set the
       borough to Manhattan, possibly overriding Bronx postal addresses. We'll trigger this
       by setting the marbleHill flag to true.

       We *won't* try this if the input text specifies the borough as Brooklyn, Queens, or
       Staten Island, or if it contains a zip code other than 10463, which is the only valid
       Marble Hill zip.

       Querying the PAD file for zip 10463 reveals some streets (and placenames residing in the
       stname field) that are entirely within borough 1, so any address on those streets will be
       in Marble Hill. For certain other street names we'll examine the housenumber and determine
       if it lies within the range of addresses in Marble Hill.

       In most cases we can accurately identify a Marble Hill address even when no borough is
       specified by the input text (either explicity or implicitly by zip code.) This parser will
       return a borough code via deduction in these cases, and only in these cases. (It would, in
       fact, be possible to deduce a missing borough for many housenumber/streetname combinations
       in NYC, but that's not a parser's job -- it's only done here because Marble Hill is a
       special problem.)

       Note that there's a boro 1 regex for 'MARBLE ?HI?L?L' in the boroRegexes list in step 1, so
       any input that uses Marble Hill as the city name (incorrect addressing, but sometimes seen
       nonetheless) will be considered Manhattan. But even so, we won't return the marble_hill tag
       unless the address passes one of the checks below.

       Also note that this code can report entirely fictional addresses as being in Marble Hill.
       Since this is a parser, not a validator or address database, this isn't an issue. As long
       as we set the marbleHill flag for any common form of any real Marble Hill address and do
       not set the flag for any common form of any real non-Marble-Hill address, that's good
       enough.
    */
    if (((postcode === '') || (postcode.indexOf('10463') === 0)) && ![3,4,5].includes(boro)) {
        /* First check -- Any address whose streetname text contains "MARBLE HILL HOUSES" is in
           Marble Hill. (Except for MARBLE HILL HOUSES BUILDING 4/5/6/11, which are in the Bronx.
           If one of those is found we'll actually override the borough to Bronx, in case the
           input text erroneously specified Manhattan.)
         */
        const mhhMatches = streetText.match(/MARBLE HI?L?L HOUSES( B(UI)?LDI?N?G (\d+))?/);
        if (Array.isArray(mhhMatches)) {
            if ((mhhMatches.length > 3) && (['4','5','6','11'].includes(mhhMatches[3]))) {
                boro = 2;
            } else {
                marbleHill = true;
            }
        } else {
            /* Second check -- See if the input street name matches one of the streets or
               unnumbered placenames that's unambiguously entirely within Marble Hill. (West
               228th Street could go in this list as well, but it's handled in the third check.)
             */
            const marbleHillStreetRegexes = ['ADRIAN AVE?(NUE)?', 'FO?R?T CHARLES PL(ACE)?',
                'JACOBUS PL(ACE)?', 'TERRACE V(IE)?W AVE?(NUE)?', 'VAN CORLEAR PL(ACE)?',
                'METRO NORTH-MARBLE HI?L?L', 'BROADWAY BRI?DGE?', 'MARBLE HI?L?L LA?NE?',
                'ATMOSPHERE CHARTER SCH(OO)?L?', '(THE )?SHOPS AT MARBLE HI?L?L',
                'IRT-1-MARBLE HI?L?L-225 STREET'];
            if (marbleHillStreetRegexes.some((p) => wholeStringMatchesPattern(streetText, p))) {
                marbleHill = true;
            } else if ((housenumberTokenCount > 0) && !(tokens[0].includes('-'))) {
                /* Third and final check -- If the input text includes a housenumber (excluding
                   any housenumbers with hyphens, since none of those are found in Marble Hill
                   but they might cause confusion with some Queens addresses), check the street
                   name against the four streets that, per the PAD, have some Marble Hill
                   addresses and some non-Marble-Hill addresses. (Actually it's just three streets,
                   but we'll tack on West 228th as well so we can look for its "front-truncated"
                   form, see below.)

                   a) BROADWAY -- Marble Hill housenumbers range from 5170 to 5480, plus 5485.

                      * Note that Brooklyn and Staten Island both have their own streets named
                      Broadway, distinct from the famous Broadway that runs through Manhattan
                      (including Marble Hill) and the Bronx. Luckily the highest Broadway address
                      in Brooklyn 2090 and the highest in Staten Island is 723, so there's
                      nothing preventing us from concluding that eg "5201 BROADWAY" with no boro
                      specified is in Marble Hill rather than Brooklyn or Staten Island.

                      * Queens also has a Broadway, and that one's trickier. Housenumbers on Queens
                      Broadway are hyphenated, but it's common to see them written without the
                      hyphens. Based on the current Queens Broadway address inventory in the PAD
                      file, housenumber ranges from 53-01 to 53-19 and 54-02 to 54-20 are potentially
                      problematic. Luckily there are currently no Marble Hill housenumbers from 5301
                      to 5320 or from 5401 to 5420 (padding slightly), so we'll carve these out from
                      the ranges that will trigger the Marble Hill tagging, unless the borough was
                      detected as 1 or 2 from the input text.
                      (This is a fragile solution that might risk returning bad results for input
                      that doesn't specify the boro, if there's ever renumbering due to development
                      in either Queens or Marble Hill. If so we might need to change tactics, eg,
                      assume that, for purposes of setting the marbleHill flag, Broadway housenumbers
                      without hyphens are not in Queens unless the borough is specified explicitly.)

                   b) WEST 225TH STREET -- Marble Hill housenumbers range from 40 to 176
                   c) WEST 227TH STREET -- Marble Hill housenumbers range from 103 to 130
                   d) WEST 228TH STREET -- Marble Hill housenumbers range from 100 to 174

                      * For simplicity, we'll just use West 225th's range of 40 to 176 for all three
                      of these. Given the current and presumed future housenumber layout, there's
                      negligible chance of false positives or false negatives.

                      * It's common in NYC to omit the EAST or WEST directional prefix on many
                      streets, if it doesn't cause ambiguity. (The City calls this practice "front
                      truncation.") So we'll match these streets with or without the WEST. Luckily,
                      even with the front truncation, we don't have conflicts in this address range
                      in other boroughs.
                 */
                const housenumberInt = parseInt(tokens[0]);
                if ( ((streetText === 'BROADWAY') &&
                      ((housenumberInt === 5485) ||
                       ((housenumberInt >= 5170) && (housenumberInt <= 5300)) ||
                       ((housenumberInt >= 5301) && (housenumberInt <= 5320) && (boro < 3)) ||
                       ((housenumberInt >= 5321) && (housenumberInt <= 5400)) ||
                       ((housenumberInt >= 5401) && (housenumberInt <= 5321) && (boro < 3)) ||
                       ((housenumberInt >= 5421) && (housenumberInt <= 5480))))
                    ||
                     ((wholeStringMatchesPattern(streetText, '(W(EST)? )?22[578](TH)?( STR?(EET)?)?')) &&
                      (housenumberInt >= 40) && (housenumberInt <= 176)) ) {
                    marbleHill = true;
                }
            }
        }
        if (marbleHill) {
            boro = 1;
        }
    }

    /* Add borough/postcode/marble_hill output items, if applicable */
    if (boro < 6) {
        output['borough'] = boro;
    }
    if (postcode !== '') {
        output['postcode'] = postcode;
    }
    if (marbleHill) {
        output['marble_hill'] = true;
    }

    return output;
}

if (typeof module !== 'undefined') {
    module.exports = parseNycAddress;
}