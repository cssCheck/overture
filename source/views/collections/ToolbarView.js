import { Class } from '../../core/Core';
import '../../foundation/ComputedProps';  // For Function#property
import '../../foundation/ObservableProps';  // For Function#observes
import { lookupKey } from '../../dom/DOMEvent';
import Element from '../../dom/Element';
import { loc } from '../../localisation/LocaleController';
import View from '../View';
import RootView from '../RootView';
import ViewEventsController from '../ViewEventsController';
import PopOverView from '../panels/PopOverView';
import MenuButtonView from '../menu/MenuButtonView';
import MenuView from '../menu/MenuView';

const toView = function ( name ) {
    return ( name === '-' ) ? Element.create( 'span.v-Toolbar-divider' ) :
        ( name === '*' ) ? null :
        this._views[ name ];
};

const OverflowMenuView = Class({

    Extends: MenuButtonView,

    didEnterDocument () {
        OverflowMenuView.parent.didEnterDocument.call( this );
        this.setShortcuts( null, '', {}, this.get( 'shortcuts' ) );
        return this;
    },

    willLeaveDocument () {
        this.setShortcuts( null, '', this.get( 'shortcuts' ), {} );
        return OverflowMenuView.parent.willLeaveDocument.call( this );
    },

    shortcuts: function () {
        const views = this.getFromPath( 'menuView.options' );
        return views ? views.reduce( ( acc, view ) => {
            const shortcut = view.get( 'shortcut' );
            if ( shortcut ) {
                shortcut.split( ' ' ).forEach( key => {
                    acc[ key ] = view;
                });
            }
            return acc;
        }, {} ) : {};
    }.property( 'menuView' ),

    setShortcuts: function ( _, __, oldShortcuts, shortcuts ) {
        if ( this.get( 'isInDocument' ) ) {
            const kbShortcuts = ViewEventsController.kbShortcuts;
            if ( !shortcuts ) {
                shortcuts = this.get( 'shortcuts' );
            }
            for ( const key in oldShortcuts ) {
                kbShortcuts.deregister( key, this, 'activateButton' );
            }
            for ( const key in shortcuts ) {
                kbShortcuts.register( key, this, 'activateButton' );
            }
        }
    }.observes( 'shortcuts' ),

    activateButton ( event ) {
        const key = lookupKey( event );
        const button = this.get( 'shortcuts' )[ key ];
        if ( button instanceof MenuButtonView ) {
            this.activate();
        }
        button.activate();
    },
});

const viewIsBeforeFlex = function ( view, flex ) {
    const layer = view.get( 'layer' );
    const childNodes = flex.parentNode.childNodes;
    let l = childNodes.length;
    let node;
    while ( l-- ) {
        node = childNodes[l];
        if ( node === layer ) {
            return false;
        }
        if ( node === flex ) {
            return true;
        }
    }
    return true;
};

const ToolbarView = Class({

    Extends: View,

    className: 'v-Toolbar',

    config: 'standard',
    minimumGap: 20,
    preventOverlap: false,
    popOverOptions: null,

    init (/* ...mixins */) {
        ToolbarView.parent.constructor.apply( this, arguments );
        this._views = {
            overflow: new OverflowMenuView({
                label: loc( 'More' ),
                shortcut: '.',
                popOverView: this.popOverView || new PopOverView(),
                popOverOptions: this.get( 'popOverOptions' ),
            }),
        };
        this._configs = {
            standard: {
                left: [],
                right: [],
            },
        };
        this._measureView = null;
        this._widths = {};
        this._flex = null;
    },

    registerView ( name, view, _dontMeasure ) {
        this._views[ name ] = view;
        if ( !_dontMeasure && this.get( 'isInDocument' ) &&
                this.get( 'preventOverlap' ) ) {
            this.preMeasure().postMeasure();
        }
        return this;
    },

    registerViews ( views ) {
        for ( const name in views ) {
            this.registerView( name, views[ name ], true );
        }
        if ( this.get( 'isInDocument' ) && this.get( 'preventOverlap' ) ) {
            this.preMeasure().postMeasure();
        }
        return this;
    },

    registerConfig ( name, config ) {
        this._configs[ name ] = config;
        if ( this.get( 'config' ) === name ) {
            this.computedPropertyDidChange( 'config' );
        }
        return this;
    },

    registerConfigs ( configs ) {
        for ( const name in configs ) {
            this.registerConfig( name, configs[ name ] );
        }
        return this;
    },

    getView ( name ) {
        return this._views[ name ];
    },

    getConfig ( config ) {
        return this._configs[ config ] || null;
    },

    // ---

    leftConfig: function () {
        const configs = this._configs;
        const config = configs[ this.get( 'config' ) ];
        return ( config && config.left ) || configs.standard.left;
    }.property( 'config' ),

    rightConfig: function () {
        const configs = this._configs;
        const config = configs[ this.get( 'config' ) ];
        return ( config && config.right ) || configs.standard.right;
    }.property( 'config' ),

    left: function () {
        let leftConfig = this.get( 'leftConfig' );
        if ( this.get( 'preventOverlap' ) ) {
            const rightConfig = this.get( 'rightConfig' );
            const widths = this._widths;
            let pxWidth = this.get( 'pxWidth' );
            if ( !pxWidth ) {
                const rootView = this.getParent( RootView );
                pxWidth = rootView ? rootView.get( 'pxWidth' ) : 1024;
            }
            pxWidth -= this.get( 'minimumGap' );
            let i;
            let l;
            for ( i = 0, l = rightConfig.length; i < l; i += 1 ) {
                pxWidth -= widths[ rightConfig[i] ];
            }
            for ( i = 0, l = leftConfig.length; i < l; i += 1 ) {
                const config = leftConfig[i];
                if ( config === '*' ) {
                    break;
                } else {
                    pxWidth -= widths[ config ];
                }
            }
            if ( pxWidth < 0 || i < l ) {
                pxWidth -= widths[ '-' ];
                pxWidth -= widths.overflow;

                while ( pxWidth < 0 && i-- ) {
                    pxWidth += widths[ leftConfig[i] ];
                }

                if ( i < 0 ) {
                    i = 0;
                }

                this._views.overflow.set( 'menuView', new MenuView({
                    showFilter: false,
                    options: leftConfig.slice( i )
                        .map( toView, this )
                        .filter( view => view instanceof View ),
                }));

                if ( i > 0 ) {
                    if ( leftConfig[ i - 1 ] === '-' ) {
                        i -= 1;
                    }
                    leftConfig = leftConfig.slice( 0, i );
                    leftConfig.push( '-' );
                    leftConfig.push( 'overflow' );
                } else {
                    leftConfig = [ 'overflow' ];
                }
            }
        }
        return leftConfig.map( toView, this );
    }.property( 'leftConfig', 'rightConfig', 'pxWidth' ),

    right: function () {
        return this.get( 'rightConfig' ).map( toView, this );
    }.property( 'rightConfig' ),

    preMeasure () {
        this.insertView( this._measureView =
            new View({
                className: 'v-Toolbar-measure',
                layerStyles: {},
                childViews: Object.values( this._views )
                                  .filter( view => !view.get( 'parentView' ) ),
                draw ( layer, Element, el ) {
                    return [
                        el( 'span.v-Toolbar-divider' ),
                        View.prototype.draw.call( this, layer, Element, el ),
                    ];
                },
            })
        );
        return this;
    },

    postMeasure () {
        const widths = this._widths;
        const views = this._views;
        const measureView = this._measureView;
        const unused = measureView.get( 'childViews' );
        const container = measureView.get( 'layer' );
        const containerBoundingClientRect = container.getBoundingClientRect();
        const firstButton = unused.length ? unused[0].get( 'layer' ) : null;

        for ( const name in views ) {
            widths[ name ] = views[ name ].get( 'pxWidth' ) || widths[ name ];
        }

        // Want to include any left/right margin, so get difference between
        // edge of first button and start of container
        widths[ '-' ] = ( firstButton ?
            firstButton.getBoundingClientRect().left :
            containerBoundingClientRect.right
        ) - containerBoundingClientRect.left;

        this.removeView( measureView );
        let l = unused.length;
        while ( l-- ) {
            measureView.removeView( unused[l] );
        }
        measureView.destroy();
        this._measureView = null;

        return this;
    },

    willEnterDocument () {
        ToolbarView.parent.willEnterDocument.call( this );
        if ( this.get( 'preventOverlap' ) ) {
            this.preMeasure();
        }
        return this;
    },

    didEnterDocument () {
        ToolbarView.parent.didEnterDocument.call( this );
        if ( this.get( 'preventOverlap' ) ) {
            this.postMeasure();
        }
        return this;
    },

    draw ( layer, Element, el ) {
        return [
            this.get( 'left' ),
            this._flex = el( 'div.v-Toolbar-flex' ),
            this.get( 'right' ),
        ];
    },

    toolbarNeedsRedraw: function ( self, property, oldValue ) {
        if ( oldValue ) {
            this.propertyNeedsRedraw( self, property, oldValue );
        }
    }.observes( 'left', 'right' ),

    redrawLeft ( layer, oldViews ) {
        this.redrawSide( layer, true, oldViews, this.get( 'left' ) );
    },
    redrawRight ( layer, oldViews ) {
        this.redrawSide( layer, false, oldViews, this.get( 'right' ) );
    },

    redrawSide ( layer, isLeft, oldViews, newViews ) {
        let start = 0;
        let isEqual = true;
        const flex = this._flex;
        let i;
        let l;

        for ( i = start, l = oldViews.length; i < l; i += 1 ) {
            const view = oldViews[i];
            if ( view instanceof View ) {
                if ( isEqual && view === newViews[i] ) {
                    start += 1;
                } else {
                    isEqual = false;
                    // Check it hasn't already swapped sides!
                    if ( viewIsBeforeFlex( view, flex ) === isLeft ) {
                        this.removeView( view );
                    }
                }
            } else {
                if ( isEqual && !( newViews[i] instanceof View ) ) {
                    start += 1;
                    newViews[i] = view;
                } else {
                    layer.removeChild( view );
                }
            }
        }
        for ( i = start, l = newViews.length; i < l; i += 1 ) {
            const view = newViews[i];
            if ( view instanceof View ) {
                const parent = view.get( 'parentView' );
                if ( parent ) {
                    parent.removeView( view );
                }
                this.insertView( view,
                    isLeft ? flex : layer,
                    isLeft ? 'before' : 'bottom' );
            } else if ( view ) {
                layer.insertBefore( view, isLeft ? flex : null );
            }
        }
    },
});

ToolbarView.OverflowMenuView = OverflowMenuView;

export default ToolbarView;
