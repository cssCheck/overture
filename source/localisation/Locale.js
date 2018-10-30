import { Class, merge } from '../core/Core';
import '../core/Date';  // For Date#format. Circular but it's OK.

const compileTranslation = function ( translation ) {
    let compiled = '';
    let start = 0;
    let searchIndex = 0;
    const length = translation.length;

    outer: while ( true ) {
        let end = translation.indexOf( '[', searchIndex );
        // If there are no more macros, just the last text section to
        // process.
        if ( end === -1 ) {
            end = length;
        } else {
            // Check the '[' isn't escaped (preceded by an odd number of
            // '~' characters):
            let j = end;
            while ( j-- ) {
                if ( translation[ j ] !== '~' ) {
                    break;
                }
            }
            if ( ( end - j ) % 2 === 0 ) {
                searchIndex = end + 1;
                continue;
            }
        }
        // Standard text section
        const part = translation.slice( start, end ).replace( /~(.)/g, '$1' );
        if ( part ) {
            if ( compiled ) {
                compiled += '+';
            }
            compiled += JSON.stringify( part );
        }
        // Check if we've reached the end of the string
        if ( end === length ) {
            break;
        }
        // Macro section
        start = searchIndex = end + 1;
        // Find the end of the macro call.
        while ( true ) {
            end = translation.indexOf( ']', searchIndex );
            // Invalid translation string.
            if ( end === -1 ) {
                compiled = '';
                break outer;
            }
            // Check the ']' character isn't escaped.
            let j = end;
            while ( j-- ) {
                if ( translation[ j ] !== '~' ) {
                    break;
                }
            }
            if ( ( end - j ) % 2 ) {
                break;
            }
            searchIndex = end + 1;
        }
        // Split into parts
        const parts = translation.slice( start, end ).split( ',' );
        const l = parts.length;

        if ( compiled ) {
            compiled += '+';
        }
        if ( l > 1 ) {
            compiled += 'lang.macros["';
        }
        for ( let i = 0; i < l; i += 1 ) {
            // If not the first part, add a comma to separate the
            // arguments to the macro function call.
            if ( i > 1 ) {
                compiled += ',';
            }
            // If a comma was escaped, we split up an argument.
            // Rejoin these.
            let part = parts[i];
            let partLength = part.length;
            while ( partLength && part[ partLength - 1 ] === '~' ) {
                i += 1;
                part += ',';
                part += parts[i];
                partLength = part.length;
            }
            // Unescape the part.
            part = part.replace( /~(.)/g, '$1' );
            // Check if we've got an argument.
            if ( /^_(?:\*|\d+)$/.test( part ) ) {
                part = part.slice( 1 );
                compiled += 'args';
                compiled += ( part === '*' ?
                    '' : '[' + ( parseInt( part, 10 ) - 1 ) + ']'
                );
            } else { // Otherwise:
                if ( !i ) {
                    // First part is the macro name.
                    compiled += ( part === '*' ?
                        'quant' : part === '#' ? 'numf' : part );
                    compiled += '"].call(lang,';
                } else {
                    // Anything else is a plain string argument
                    compiled += JSON.stringify( part );
                }
            }
        }
        if ( l > 1 ) {
            compiled += ')';
        }
        start = searchIndex = end + 1;
    }

    return new Function( 'lang', 'args',
        'return ' + ( compiled || '""' ) + ';'
    );
};

const formatInt = function ( number, locale ) {
    let string = number + '';
    if ( string.length > 3 ) {
        string = string.replace(
            /(\d+?)(?=(?:\d{3})+$)/g,
            '$1' + locale.thousandsSeparator
        );
    }
    return string;
};

/**
    Class: O.Locale

    Locale packs for use in localisation are created as instances of the
    O.Locale class.
*/
const Locale = Class({

    /**
        Constructor: O.Locale

        Most options passed as the argument to this constructor are just added
        as properties to the object (and will override any inherited value for
        the same key). The following keys are special:

        code         - {String} The code for this locale. This *must* be
                       included.
        macros       - {Object} A mapping of key to functions, which may be used
                       inside the string translations (see documentation for the
                       translate method).
        translations - {Object} A mapping of key to string or function
                       specifying specific translations for this locale.
        dateFormats  - {Object} A mapping of key to (String|Date->String), each
                       taking a single Date object as an argument and outputing
                       a formatted date.

        Parameters:
            mixin - {Object} Information for this locale.
    */
    init ( mixin ) {
        [ 'macros', 'dateFormats' ].forEach( obj => {
            this[ obj ] = Object.create( this[ obj ] );
        });
        this.compiled = {};
        merge( this, mixin );
    },

    /**
        Property: O.Locale#code
        Type: String

        The ISO code for this locale.
    */
    code: 'xx',

    // === Numbers ===

    /**
        Property: O.Locale#decimalPoint
        Type: String

        The symbol used to divide the integer part from the decimal part of a
        number.
    */
    decimalPoint: '.',

    /**
        Property: O.Locale#thousandsSeparator
        Type: String

        The symbol used to divide large numbers up to make them easier to read.
    */
    thousandsSeparator: ',',

    /**
        Property: O.Locale#fileSizeUnits
        Type: String[]

        An array containing the suffix denoting units of bytes, kilobytes,
        megabytes and gigabytes (in that order).
    */
    fileSizeUnits: [ 'B', 'KB', 'MB', 'GB' ],

    /**
        Method: O.Locale#getFormattedNumber

        Format a number according to local conventions. Ensures the correct
        symbol is used for a decimal point, and inserts thousands separators if
        used in the locale.

        Parameters:
            number - {(Number|String)} The number to format.

        Returns:
            {String} The localised number.
    */
    getFormattedNumber ( number ) {
        let integer = number + '';
        let fraction = '';
        const decimalPointIndex = integer.indexOf( '.' );
        if ( decimalPointIndex > -1 ) {
            fraction = integer.slice( decimalPointIndex + 1 );
            integer = integer.slice( 0, decimalPointIndex );
        }
        return formatInt( integer, this ) +
            ( fraction && this.decimalPoint + fraction );
    },

    /**
        Method: O.Locale#getFormattedOrdinal

        Format an ordinal number according to local conventions, e.g. "1st",
        "42nd" or "53rd".

        Parameters:
            number - {Number} The number to format.

        Returns:
            {String} The localised ordinal.
    */
    getFormattedOrdinal ( number ) {
        return number + '.';
    },

    /**
        Method: O.Locale#getFormattedFileSize

        Format a number of bytes into a locale-specific file size string.

        Parameters:
            bytes         - {Number} The number of bytes.
            decimalPlaces - {Number} (optional) The number of decimal places to
                            use in the result, if in MB or GB.

        Returns:
            {String} The localised, human-readable file size.
    */
    getFormattedFileSize ( bytes, decimalPlaces ) {
        const units = this.fileSizeUnits;
        const l = units.length - 1;
        let i = 0;
        const ORDER_MAGNITUDE = 1000;
        while ( i < l && bytes >= ORDER_MAGNITUDE ) {
            bytes /= ORDER_MAGNITUDE;
            i += 1;
        }
        // B/KB to nearest whole number, MB/GB to 1 decimal place.
        const number = ( i < 2 ) ?
            Math.round( bytes ) + '' :
            bytes.toFixed( decimalPlaces || 0 );
        // Use a &nbsp; to join the number to the unit.
        return this.getFormattedNumber( number ) + ' ' + units[i];
    },

    // === Date and Time ===

    /**
        Property: O.Locale#dayNames
        Type: String[]

        Names of days of the week, starting from Sunday at index 0.
    */
    dayNames: [ 'Sunday', 'Monday', 'Tuesday',
        'Wednesday', 'Thursday', 'Friday', 'Saturday' ],
    /**
        Property: O.Locale#abbreviatedDayNames
        Type: String[]

        Abbeviated names of days of the week, starting from Sunday at index 0.
    */
    abbreviatedDayNames: [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ],

    /**
        Property: O.Locale#monthNames
        Type: String[]

        Names of months of the year, starting from January.
    */
    monthNames: [ 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December' ],

    /**
        Property: O.Locale#abbreviatedMonthNames
        Type: String[]

        Abbeviated names of months of the year, starting from January.
    */
    abbreviatedMonthNames: [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ],

    /**
        Property: O.Locale#amDesignator
        Type: String

        The string used to designate AM. Will be the empty string in locales
        which do not use the 12h clock.
    */
    amDesignator: 'AM',

    /**
        Property: O.Locale#amDesignator
        Type: String

        The string used to designate PM. Will be the empty string in locales
        which do not use the 12h clock.
    */
    pmDesignator: 'PM',

    /**
        Property: O.Locale#use24hClock
        Type: Boolean

        Should the 24h clock be used?
    */
    use24hClock: true,

    /**
        Property: O.Locale#dateElementOrde
        Type: String

        Either 'dmy', 'mdy' or 'ymd', representing the order of day/month/year
        used in this locale to write dates.
    */
    dateElementOrder: 'dmy',

    /**
        Property: O.Locale#dateFormats
        Type: String[String]

        A set of string patterns for dates, in the format used with
        <Date#format>.
    */
    dateFormats: {
        date: '%d/%m/%Y',
        time ( date, locale, utc ) {
            return date.format(
                locale.use24hClock ? this.time24 : this.time12, utc );
        },
        time12: '%-I:%M %p',
        time24: '%H:%M',
        fullDate: '%A, %-d %B %Y',
        fullDateAndTime: '%A, %-d %B %Y %H:%M',
        abbreviatedFullDate: '%a, %-d %b %Y',
        shortDayMonth: '%-d %b',
        shortDayMonthYear: '%-d %b ’%y',
    },

    /**
        Property: O.Locale#datePatterns
        Type: String[RegExp]

        A set of regular expresions for matching key words used in dates.
    */
    datePatterns: {},

    /**
        Method: O.Locale#getFormattedDate

        Get a date or time formatted according to local conventions.

        Parameters:
            date - {Date} The date object to format.
            type - {String} The type of result you want, e.g. 'shortDate',
                   'time', 'fullDateAndTime'.
            utc  - {Boolean} (optional) If true, the UTC time of this date
                   object will be used when determining the date.

        Returns:
            {String} The localised date.
    */
    getFormattedDate ( date, type, utc ) {
        const dateFormats = this.dateFormats;
        const format = dateFormats[ type ] || dateFormats.date;
        return format instanceof Function ?
            dateFormats[ type ]( date, this, utc ) : date.format( format, utc );
    },

    // === Strings ===

    /**
        Property: O.Locale#macros
        Type: String[Function]

        The set of named macros that may be used in translations using the
        square brackets notation.
    */
    macros: {
        // Japanese, Vietnamese, Korean.
        // Case 1: everything.
        // Case 2: is 0 (optional; case 1 used if not supplied).
        '*1' ( n, singular, zero ) {
            return ( !n && zero !== undefined ? zero : singular
            ).replace( '%n', formatInt( n, this ) );
        },
        // Most Western languages.
        // Case 1: is 1.
        // Case 2: everything else.
        // Case 3: is 0 (optional; plural used if not supplied).
        '*2' ( n, singular, plural, zero ) {
            return ( n === 1 ? singular :
                !n && zero !== undefined ? zero : plural
            ).replace( '%n', formatInt( n, this ) );
        },
        // French and Brazilian Portuguese.
        // Case 1: is 0 or 1.
        // Case 2: everything else.
        // Case 3: is 0 (optional; singular used if not supplied).
        '*2a' ( n, singular, plural, zero ) {
            return ( n > 1 ? plural :
                !n && zero !== undefined ? zero : singular
            ).replace( '%n', formatInt( n, this ) );
        },
        // Hungarian
        // Case 1: is 0,*3,*6,*8,*20,*30,*60,*80,*00,*000000, *000000+.
        // Case 2: everything else
        //        (*1,*2,*4,*5,*7,*9,*10,*40,*50,*70,*90,*000,*0000,*00000).
        // Case 3: is 0 (optional; case 1 used if not supplied)
        '*2b' ( n, form1, form2, zero ) {
            return ( !n ? zero !== undefined ? zero : form1 :
                ( /(?:[368]|20|30|60|80|[^0]00|0{6,})$/.test( n + '' ) ) ?
                form1 : form2
            ).replace( '%n', formatInt( n, this ) );
        },
        // Latvian.
        // Case 1: is 0.
        // Case 2: ends in 1, does not end in 11.
        // Case 3: everything else.
        '*3a' ( n, zero, plural1, plural2 ) {
            return (
                !n ? zero :
                n % 10 === 1 && n % 100 !== 11 ? plural1 : plural2
            ).replace( '%n', formatInt( n, this ) );
        },
        // Romanian.
        // Case 1: is 1.
        // Case 2: is 0 or ends in 01-19.
        // Case 3: everything else.
        // Case 4: is 0 (optional; case 2 used if not supplied)
        '*3b' ( n, singular, plural1, plural2, zero ) {
            const mod100 = n % 100;
            return (
                !n && zero !== undefined ? zero :
                n === 1 ? singular :
                !n || ( 1 <= mod100 && mod100 <= 19 ) ? plural1 : plural2
            ).replace( '%n', formatInt( n, this ) );
        },
        // Lithuanian.
        // Case 1: ends in 1, not 11.
        // Case 2: ends in 0 or ends in 10-20.
        // Case 3: everything else.
        // Case 4: is 0 (optional; case 2 used if not supplied)
        '*3c' ( n, form1, form2, form3, zero ) {
            const mod10 = n % 10;
            const mod100 = n % 100;
            return (
                !n && zero !== undefined ? zero :
                mod10 === 1 && mod100 !== 11 ? form1 :
                mod10 === 0 || ( 10 <= mod100 && mod100 <= 20 ) ? form2 : form3
            ).replace( '%n', formatInt( n, this ) );
        },
        // Russian, Ukrainian, Serbian, Croatian.
        // Case 1: ends in 1, does not end in 11.
        // Case 2: ends in 2-4, does not end in 12-14.
        // Case 3: everything else
        // Case 4: is 0 (optional; case 3 used if not supplied)
        '*3d' ( n, form1, form2, form3, zero ) {
            const mod10 = n % 10;
            const mod100 = n % 100;
            return (
                !n && zero !== undefined ? zero :
                mod10 === 1 && mod100 !== 11 ? form1 :
                2 <= mod10 && mod10 <= 4 && ( mod100 < 12 || mod100 > 14 ) ?
                form2 : form3
            ).replace( '%n', formatInt( n, this ) );
        },
        // Czech, Slovak.
        // Case 1: is 1.
        // Case 2: is 2-4.
        // Case 3: everything else.
        // Case 4: is 0 (optional; case 3 used if not supplied)
        '*3e' ( n, singular, plural1, plural2, zero ) {
            return (
                !n && zero !== undefined ? zero :
                n === 1 ? singular :
                2 <= n && n <= 4 ? plural1 : plural2
            ).replace( '%n', formatInt( n, this ) );
        },
        // Polish.
        // Case 1: is 1.
        // Case 2: ends in 2-4, does not end in 12-14.
        // Case 3: everything else
        // Case 4: is 0 (optional; case 3 used if not supplied)
        '*3f' ( n, singular, plural1, plural2, zero ) {
            const mod10 = n % 10;
            const mod100 = n % 100;
            return (
                !n && zero !== undefined ? zero :
                n === 1 ? singular :
                2 <= mod10 && mod10 <= 4 && ( mod100 < 12 || mod100 > 14 ) ?
                plural1 : plural2
            ).replace( '%n', formatInt( n, this ) );
        },
        // Slovenian, Sorbian.
        // Case 1: ends in 01.
        // Case 2: ends in 02.
        // Case 3: ends in 03 or 04.
        // Case 4: everything else.
        // Case 5: is 0 (optional; case 4 used if not supplied)
        '*4a' ( n, end01, end02, end03or04, plural, zero ) {
            const mod100 = n % 100;
            return (
                !n && zero !== undefined ? zero :
                mod100 === 1 ? end01 :
                mod100 === 2 ? end02 :
                mod100 === 3 || mod100 === 4 ? end03or04 : plural
            ).replace( '%n', formatInt( n, this ) );
        },
        // Scottish Gaelic.
        // Case 1: is 1 or 11.
        // Case 2: is 2 or 12.
        // Case 3: is 3-19.
        // Case 4: everything else.
        // Case 5: is 0 (optional; case 4 used if not supplied)
        '*4b' ( n, form1, form2, form3, form4, zero ) {
            return (
                !n && zero !== undefined ? zero :
                n === 1 || n === 11 ? form1 :
                n === 2 || n === 12 ? form2 :
                3 <= n && n <= 19 ? form3 : form4
            ).replace( '%n', formatInt( n, this ) );
        },
        // Gaeilge (Irish).
        // Case 1: is 1.
        // Case 2: is 2.
        // Case 3: is 3-6.
        // Case 4: is 7-10.
        // Case 5: everything else.
        // Case 6: is 0 (optional; case 5 used if not supplied)
        '*5' ( n, singular, doubular, form1, form2, form3, zero ) {
            return (
                !n && zero !== undefined ? zero :
                n === 1 ? singular :
                n === 2 ? doubular :
                3 <= n && n <= 6 ? form1 :
                7 <= n && n <= 10 ? form2 : form3
            ).replace( '%n', formatInt( n, this ) );
        },
        // Arabic.
        // Case 1: is 0.
        // Case 2: is 1.
        // Case 3: is 2.
        // Case 4: ends in 03-10.
        // Case 5: ends in 11-99.
        // Case 6: everything else.
        '*6' ( n, zero, singular, doubular, pl1, pl2, pl3 ) {
            const mod100 = n % 100;
            return (
                !n ? zero :
                n === 1 ? singular :
                n === 2 ? doubular :
                3 <= mod100 && mod100 <= 10 ? pl1 :
                11 <= mod100 && mod100 <= 99 ? pl2 : pl3
            ).replace( '%n', formatInt( n, this ) );
        },
    },

    /**
        Property: O.Locale#translations
        Type: String[String]

        A map from the string identifier or English string to the localised
        string.
    */
    translations: {},

    /**
        Method: O.Locale#translate

        Get a localised version of a string.

        This method will first look up the string given as its first argument in
        the translations object for this locale. If it finds a value it will use
        that, otherwise it will use the original supplied string.

        If futher arguments are given, these are interpolated into the string.
        There are two different ways this can happen:

        1. If all the arguments are strings or numbers:

           Square brackets may be used inside strings to call macros; the syntax
           is the same as for Perl's maketext module. A macro is called like
           this: `[name,_1,arg2,arg3]`. Arguments are passed as literal strings,
           except if it is _n, where n is an integer. In this case, the argument
           will be argument n supplied at runtime to the translation method. To
           include a literal comma or close square bracket, precede it by a
           tilde. Macros are defined in the macro object of the locale and will
           be called with the locale object as the `this` parameter.

           The source string can also use a square bracket notation to just
           insert an argument, e.g.

               O.loc( "The city of [_1] is in [_2]", "Melbourne", "Australia" )
               => "The city of Melbourne is in Australia".

           The rules for pluralisation vary between languages, so if you have
           numbers you need to interpolate, your source string should use the
           appropriate pluralisation macro for your language. e.g.

               O.loc(
                 "[*2,_1,1 file was,%n files were,No files were] found in [_2]",
                 11, "Documents" );
               => "11 files were found in Documents"

        2. If at least one of the arguments is an object:

           The result will be an array of string parts and your arguments.
           This can be useful when working with views, for example:

               O.Element.appendChildren( layer, O.loc(
                   "Searching [_1] for [_2]",
                   new O.SelectView({
                       value: O.bind(...),
                       options: [
                           { text: O.loc( "Everything" ),
                             value: true },
                           { text: O.loc( "Documents" ),
                             value: false }
                       ]
                   }),
                   el( 'b', {
                       text: O.bind(...)
                   })
               ));

        Parameters:
            string   - {String} The string to localise.
            var_args - {...(String|Number|Object)} The arguments to interpolate.

        Returns:
            {(String|Array)} The localised string or array of localised parts.
    */
    translate ( string ) {
        let translation = this.translations[ string ];
        let returnString = true;
        const args = [];
        let i;
        let l;

        if ( translation === undefined ) {
            translation = string;
        }

        for ( i = 1, l = arguments.length; i < l; i += 1 ) {
            const arg = arguments[i];
            if ( typeof arg === 'object' ) {
                returnString = false;
            }
            args[ i - 1 ] = arg;
        }

        if ( returnString ) {
            const compiled = this.compiled[ string ] ||
                ( this.compiled[ string ] = compileTranslation( translation ) );
            return compiled( this, args );
        }

        const parts = translation.split( /\[_(\d)\]/ );
        for ( i = 0, l = parts.length; i < l; i += 1 ) {
            const part = parts[i];
            if ( i % 2 === 1 ) {
                parts[i] = args[ part - 1 ] || null;
            } else if ( part.indexOf( '[*' ) !== -1 ) {
                // Presumably it contains a macro; execute that.
                const compiled = this.compiled[ part ] ||
                    ( this.compiled[ part ] = compileTranslation( part ) );
                parts[i] = compiled( this, args );
            }
        }
        return parts;
    },
});

export default Locale;
