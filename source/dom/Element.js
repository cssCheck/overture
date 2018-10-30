/*global Element, document */

import '../core/String';  // For String#camelCase, #contains, #hyphenate
import UA from '../ua/UA';
import Binding from '../foundation/Binding';
import RunLoop from '../foundation/RunLoop';
import View from '../views/View';  // Circular but it's OK

/**
    Module: DOM

    The DOM module provides helper functions and classes for dealing with the
    DOM.
*/

/**
    Namespace: O.Element

    The O.Element namespace contains a number of helper functions for dealing
    with DOM elements.
*/

// Vars used to store references to fns so they can call each other.
let setStyle;
let setStyles;
let setAttributes;
let appendChildren;
let getPosition;

/**
    Property (private): Element-directProperties
    Type: Object

    Any names that match keys in this map will be set as direct properties
    rather than as attributes on the element.
*/
const directProperties = {
    // Note: SVGElement#className is an SVGAnimatedString.
    'class': 'className',
    className: 'className',
    defaultValue: 'defaultValue',
    'for': 'htmlFor',
    html: 'innerHTML',
    text: 'textContent',
    unselectable: 'unselectable',
    value: 'value',
};

/**
    Property (private): Element-svgTagNames
    Type: Set

    When creating inline SVG elements the SVG namespace must be used. This list
    allows `Element.create` to handle SVG tag names transparently.

    Note that `title` is included in this, because we don’t expect Overture to
    ever be creating HTML `<title>` elements.

    Note that SVG attributes don’t use a namespace; only the element needs it.
    That simplifies things a bit.
*/
// I took this list from html.vim; it probably covers SVG 1.1 completely.
const svgTagNames = new Set([
    'svg', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
    'animateMotion', 'animateTransform', 'circle', 'ellipse', 'rect', 'line',
    'polyline', 'polygon', 'image', 'path', 'clipPath', 'color-profile',
    'cursor', 'defs', 'desc', 'g', 'symbol', 'view', 'use', 'switch',
    'foreignObject', 'filter', 'feBlend', 'feColorMatrix',
    'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
    'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feFlood',
    'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage',
    'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
    'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'font',
    'font-face', 'font-face-format', 'font-face-name', 'font-face-src',
    'font-face-uri', 'glyph', 'glyphRef', 'hkern', 'linearGradient', 'marker',
    'mask', 'pattern', 'radialGradient', 'set', 'stop', 'missing-glyph',
    'mpath', 'text', 'textPath', 'tref', 'tspan', 'vkern', 'metadata', 'title',
]);

/**
    Property (private): Element-svgNS
    Type: String

    The URL for the SVG XML namespace.
*/
const svgNS = 'http://www.w3.org/2000/svg';

/**
    Property (private): Element-booleanProperties
    Type: Object

    Any names that match keys in this map will be set as direct properties and
    have their value converted to a boolean.
*/
const booleanProperties = {
    autofocus: 1,
    checked: 1,
    defaultChecked: 1,
    disabled: 1,
    hidden: 1,
    multiple: 1,
    readOnly: 1,
    required: 1,
    selected: 1,
    webkitdirectory: 1,
};

/**
    Method: Element#get

    Get a property or attribute of the element.

    Parameters:
        key - {String} The name of the property/attribute to get.

    Returns:
        {String|Boolean} The attribute or property.
*/
Element.prototype.get = function ( key ) {
    const prop = directProperties[ key ];
    if ( prop ) {
        const value = this[ prop ];
        return ( value instanceof SVGAnimatedString ) ? value.animVal : value;
    }
    return booleanProperties[ key ] ?
        !!this[ key ] :
        this.getAttribute( key );
};

/**
    Method: Element#set

    Sets a property or attribute on the element.

    Parameters:
        key   - {String} The name of the property/attribute to set.
        value - {String|Boolean} The value to set for that property.

    Returns:
        {Element} Returns self.
*/
Element.prototype.set = function ( key, value ) {
    const prop = directProperties[ key ];
    if ( prop ) {
        const currentValue = this[ prop ];
        value = value == null ? '' : '' + value;
        if ( currentValue instanceof SVGAnimatedString ) {
            currentValue.baseVal = value;
        } else {
            this[ prop ] = value;
        }
    } else if ( booleanProperties[ key ] ) {
        this[ key ] = !!value;
    } else if ( key === 'styles' ) {
        setStyles( this, value );
    } else if ( key === 'children' ) {
        let child;
        while ( child = this.lastChild ) {
            this.removeChild( child );
        }
        appendChildren( this, value );
    } else if ( value == null ) {
        this.removeAttribute( key );
    } else {
        this.setAttribute( key, '' + value );
    }
    return this;
};

/**
    Property (private): Element-cssNoPx
    Type: Object

    Keys for CSS properties that take raw numbers as a value.
*/
const cssNoPx = {
    opacity: 1,
    zIndex: 1,
};

/**
    Property (private): Element-styleNames
    Type: Object

    Map of normal CSS names to the name used on the style object.
*/
const styleNames = {
    'float': document.body.style.cssFloat !== undefined ?
        'cssFloat' : 'styleFloat',
};
const styles = UA.cssProps;
for ( const property in styles ) {
    let style = styles[ property ];
    if ( style ) {
        style = style.camelCase();
        // Stupid MS, don't follow convention.
        if ( style.slice( 0, 2 ) === 'Ms' ) {
            style = 'm' + style.slice( 1 );
        }
        styleNames[ property.camelCase() ] = style;
    }
}

/**
    Property (private): O.Element-doc
    Type: Document

    A reference to the document object.
*/
const doc = document;

// = Node.DOCUMENT_POSITION_CONTAINED_BY
const DOCUMENT_POSITION_CONTAINED_BY = 16;

let view = null;

export default {
    /**
        Function: O.Element.forView

        Sets the view to which newly created elements should be associated. This
        is used to associate bindings with a view and to add child views as
        subviews correctly. This is normally handled automatically by the render
        method in <O.View>, however should you need to use it manually it is
        important to store the previous view (returned by the method) and
        restore it when you are done creating elements for your view.

        Parameters:
            view - {(O.View|null)} The view to associate new/appended DOM
                   elements with.

        Returns:
            {(O.View|null)} The previous view DOM elements were associated with.
    */
    forView ( newView ) {
        const oldView = view;
        view = newView;
        return oldView;
    },

    /**
        Function: O.Element.create

        Creates and returns a new element, setting any supplied properties and
        appending any supplied children. If the browser event system doesn't
        support capturing (just IE<8), then this will also add an event listener
        for change and input events to any form elements.

        Parameters:
            tag      - {String} The tag name for the new class. You may also
                       specify class names and an id here using CSS syntax
                       (.class, #id). For example to create <span id="id"
                       class="class1 class2"></span> you could call:
                       O.Element.create('span#id.class1.class2');
            props    - {Object} (optional) The attributes to add to the element,
                       e.g. Element.create('input', { type: 'text' }); The
                       special attributes 'text' and 'html' allow you to set the
                       textual or html content of the element respectively.
            children - {(Element|String)[]} (optional) An array of child nodes
                       and/or strings of text to append to the element.
                       Text nodes will be created for each string supplied. Null
                       or undefined values will simply be skipped.

        Returns:
            {Element} The new element.
    */
    create ( tag, props, children ) {
        if ( props instanceof Array ) {
            children = props;
            props = null;
        }

        // Parse id/class names out of tag.
        if ( /[#.]/.test( tag ) ) {
            const parts = tag.split( /([#.])/ );
            tag = parts[0];
            if ( !props ) {
                props = {};
            }
            const l = parts.length;
            for ( let i = 1; i + 1 < l; i += 2 ) {
                const name = parts[ i + 1 ];
                if ( parts[i] === '#' ) {
                    props.id = name;
                } else {
                    props.className = props.className ?
                        props.className + ' ' + name : name;
                }
            }
        }

        // Create element with default or SVG namespace, as appropriate.
        const el = svgTagNames.has( tag ) ?
            doc.createElementNS( svgNS, tag ) :
            doc.createElement( tag );

        if ( props ) {
            setAttributes( el, props );
        }
        if ( children ) {
            appendChildren( el, children );
        }
        return el;
    },

    /**
        Function: O.Element.setAttributes

        Sets each attribute in the object on the given element.

        Parameters:
            el    - {Element} The element to set the attributes on.
            props - {Object} The attributes to add to the element.
                    e.g. `Element.create('input', { type: 'text' });`
                    The special attributes `'text'` and `'html'` allow you to
                    set the textual or html content of the element respectively.

        Returns:
            {Element} The element.
    */
    setAttributes: setAttributes = function ( el, props ) {
        for ( const prop in props ) {
            const value = props[ prop ];
            if ( value !== undefined ) {
                if ( value instanceof Binding ) {
                    value.to( prop, el ).connect();
                    if ( view ) {
                        view.registerBinding( value );
                    }
                } else {
                    el.set( prop, value );
                }
            }
        }
        return el;
    },

    /**
        Function: O.Element.appendChildren

        Appends an array of children or views to an element

        Parameters:
            el       - {Element} The element to append to.
            children - {(Element|O.View)[]} The children to append.

        Returns:
            {Element} The element.
    */
    appendChildren: appendChildren = function ( el, children ) {
        if ( !( children instanceof Array ) ) {
            children = [ children ];
        }
        for ( let i = 0, l = children.length; i < l; i += 1 ) {
            let node = children[i];
            if ( node ) {
                if ( node instanceof Array ) {
                    appendChildren( el, node );
                } else if ( node instanceof View ) {
                    view.insertView( node, el );
                } else {
                    if ( typeof node !== 'object' ) {
                        node = doc.createTextNode( node );
                    }
                    el.appendChild( node );
                }
            }
        }
        return el;
    },

    /**
        Function: O.Element.setStyle

        Sets a CSS style on the element.

        Parameters:
            el    - {Element} The element to set the style on.
            style - {String} The name of the style to set.
            value - {(String|Number)} The value to set the style to.

        Returns:
            {O.Element} Returns self.
    */
    setStyle: setStyle = function ( el, style, value ) {
        if ( value !== undefined ) {
            style = style.camelCase();
            style = styleNames[ style ] || style;
            if ( typeof value === 'number' && !cssNoPx[ style ] ) {
                value += 'px';
            }
            // IE will throw an error if you try to set an invalid value for a
            // style.
            try {
                el.style[ style ] = value;
            } catch ( error ) {
                RunLoop.didError({
                    name: 'Element#setStyle',
                    message: 'Invalid value set',
                    details:
                        'Style: ' + style +
                      '\nValue: ' + value +
                      '\nEl id: ' + el.id +
                      '\nEl class: ' + el.className,
                });
            }
        }
        return this;
    },

    /**
        Function: O.Element.setStyles

        Set a collection of CSS styles on the element.

        Parameters:
            el    - {Element} The element to set the style on.
            styles - {Object} A map of styles->values to set.

        Returns:
            {O.Element} Returns self.
    */
    setStyles: setStyles = function ( el, styles ) {
        for ( const prop in styles ) {
            setStyle( el, prop, styles[ prop ] );
        }
        return this;
    },

    /**
        Function: O.Element.contains

        Tests whether one element is a descendent of or is the same node as
        another element.

        Parameters:
            el             - {Element} The element that might be the parent
                             element
            potentialChild - {Element} The element to test if it is the same as
                             or a descendent of the parent element.

        Returns:
            {Boolean} Is the second element equal to or a descendent of the
            first element?
    */
    contains ( el, potentialChild ) {
        const relation = el.compareDocumentPosition( potentialChild );
        return !relation || !!( relation & DOCUMENT_POSITION_CONTAINED_BY );
    },

    /**
        Function: O.Element.nearest

        Looks for the nearest element which is accepted by the test function or
        is of the element type given as the test string. The element given is
        tested first, then its parent, then its parent's parent etc.

        Parameters:
            el    - {Element} The element to start searching from.
            test  - {(String|Function)} If a function, this is called on each
                    successive element until one causes it to return a truthy
                    value. That element is then returned. If it is a string,
                    each element is instead checked to see if its nodeName is
                    the same as this string.
            limit - {Element} (optional) An element known to be higher in the
                    hierarchy than the desired element. If this is found in the
                    search path, a null result will be immediately be returned.

        Returns:
            {(Element|null)} The nearest matching element, or null if none
            matched.
    */
    nearest ( el, test, limit ) {
        if ( !limit ) {
            limit = el.ownerDocument.documentElement;
        }
        if ( typeof test === 'string' ) {
            const nodeName = test.toUpperCase();
            test = el => el.nodeName === nodeName;
        }
        while ( el && !test( el ) ) {
            if ( !el || el === limit ) {
                return null;
            }
            el = el.parentNode;
        }
        return el;
    },

    /**
        Function: O.Element.getPosition

        Find the position of the top left corner of the element in pixels,
        relative either to the page as a whole or a supplied ancestor of the
        element.

        Parameters:
            el       - {Element} The element to determine the position of.
            ancestor - {Element} The top left corner of this element will be
                       treated as co-ordinates (0,0). This must be an ancestor
                       of the given element in the DOM tree.

        Returns:
            {Object} The offset in pixels of the element relative to the
            given ancestor or the whole page, plus the height and width.
            Has four properties:

            - top: `Number`
            - left: `Number`
            - width: `Number`
            - height: `Number`
    */
    getPosition: getPosition = function ( el, ancestor ) {
        let rect = el.getBoundingClientRect();
        const position = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
        };
        if ( ancestor ) {
            rect = getPosition( ancestor );
            if ( ancestor.nodeName === 'BODY' ) {
                // document.documentElement - use of
                // body.scroll(Top|Left) is deprecated.
                ancestor = ancestor.parentNode;
            }
            position.top -= rect.top - ancestor.scrollTop;
            position.left -= rect.left - ancestor.scrollLeft;
        }
        return position;
    },
};

/**
    Function: Object.toCSSString

    Converts an object into a String of 'key:value' pairs, delimited by ';'.
    Keys are converted from camel case to hyphenated format and numerical
    values are converted to strings with a 'px' suffix.

    Parameters:
        object - {Object} The object of CSS properties.

    Returns:
        {String} The CSS string.
*/
Object.toCSSString = function ( object ) {
    let result = '';
    for ( let key in object ) {
        let value = object[ key ];
        if ( value !== undefined ) {
            if ( typeof value === 'number' && !cssNoPx[ key ] ) {
                value += 'px';
            }
            key = key.hyphenate();
            key = UA.cssProps[ key ] || key;
            result += key;
            result += ':';
            result += value;
            result += ';';
        }
    }
    return result;
};

// TODO(cmorgan/modulify): do something about these exports: Object.toCSSString
// Element#get, Element#set
