const DEFAULT_NAMESPACE = 'modblocks';
const STYLE_PREFIX = 'modblocks-style';
const STYLE_REGISTRY = new Map();

export const DEFAULT_THEME = {
    pageBackground: 'linear-gradient(135deg, #0b1020 0%, #111827 60%, #1f2937 100%)',
    textColor: '#f8fafc',
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    sectionGap: '48px',
    gridGap: '32px',
    maxWidth: '1200px',
    minColumnWidth: '280px',
    blockBackground: 'rgba(17, 25, 40, 0.72)',
    blockPadding: 'clamp(24px, 3vw, 36px)',
    blockRadius: '24px',
    blockBorder: '1px solid rgba(148, 163, 184, 0.18)',
    blockShadow: '0 28px 60px -22px rgba(15, 23, 42, 0.65)',
    blockBlur: '18px',
    blockContentGap: '20px',
    mutedColor: 'rgba(148, 163, 184, 0.85)',
    accentColor: '#38bdf8',
    bannerBackground: 'linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(14, 165, 233, 0.45))',
    bannerTextColor: '#f8fafc',
    bannerOverlay: 'rgba(15, 23, 42, 0.28)',
    ctaBackground: '#38bdf8',
    ctaColor: '#0f172a',
    imageRadius: '20px',
    calendarGridColor: 'rgba(148, 163, 184, 0.35)',
    calendarAccentBackground: 'rgba(56, 189, 248, 0.16)',
    calendarAccentColor: '#38bdf8',
    calendarMaxWidth: '960px',
    calendarCardMinWidth: '180px'
};

const BLOCK_RENDERERS = new Map();

function createHelpers(namespace = DEFAULT_NAMESPACE) {
    const normalized = (typeof namespace === 'string' && namespace.trim()) || DEFAULT_NAMESPACE;
    const className = (name = '') => `${normalized}-${name}`;
    const selector = (name = '') => `.${className(name)}`;
    const token = (name = '') => `var(--${normalized}-${name})`;
    return { namespace: normalized, className, selector, token };
}

function buildBaseStyleRules(helpers) {
    const { selector, token } = helpers;
    return [
        {
            selectors: [selector('page')],
            declarations: {
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                gap: token('section-gap'),
                background: token('page-bg'),
                color: token('text-color'),
                fontFamily: token('font-family'),
                padding: 'clamp(28px, 5vw, 72px) clamp(18px, 6vw, 88px)',
                boxSizing: 'border-box'
            }
        },
        {
            selectors: [
                `${selector('page')} h1`,
                `${selector('page')} h2`,
                `${selector('page')} h3`,
                `${selector('page')} h4`
            ],
            declarations: {
                color: token('text-color')
            }
        },
        {
            selectors: [selector('page') + ' p'],
            declarations: {
                margin: '0'
            }
        },
        {
            selectors: [selector('grid')],
            declarations: {
                width: 'min(' + token('max-width') + ', 100%)',
                margin: '0 auto',
                display: 'grid',
                gap: token('grid-gap'),
                gridTemplateColumns: 'repeat(auto-fit, minmax(' + token('min-column') + ', 1fr))'
            }
        },
        {
            selectors: [selector('block')],
            declarations: {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: token('block-gap'),
                padding: token('block-padding'),
                borderRadius: token('block-radius'),
                background: token('block-bg'),
                border: token('block-border'),
                boxShadow: token('block-shadow'),
                backdropFilter: 'blur(' + token('block-blur') + ')',
                overflow: 'hidden'
            }
        },
        {
            selectors: [selector('block--banner')],
            declarations: {
                padding: 'clamp(36px, 5vw, 56px)',
                background: token('banner-gradient'),
                color: token('banner-text')
            }
        },
        {
            selectors: [`${selector('block--banner')}::after`],
            declarations: {
                content: "''",
                position: 'absolute',
                inset: '0',
                background: token('banner-overlay'),
                pointerEvents: 'none'
            }
        },
        {
            selectors: [`${selector('block--banner')} > *`],
            declarations: {
                position: 'relative',
                zIndex: '1'
            }
        },
        {
            selectors: [selector('banner__layout')],
            declarations: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'clamp(32px, 6vw, 96px)',
                flexWrap: 'wrap'
            }
        },
        {
            selectors: [selector('banner__copy')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                maxWidth: '520px'
            }
        },
        {
            selectors: [selector('banner__eyebrow')],
            declarations: {
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: token('accent-color'),
                fontWeight: '600'
            }
        },
        {
            selectors: [selector('banner__title')],
            declarations: {
                fontSize: 'clamp(2.6rem, 5vw, 3.6rem)',
                lineHeight: '1.05',
                fontWeight: '700',
                margin: '0'
            }
        },
        {
            selectors: [selector('banner__subtitle')],
            declarations: {
                color: token('banner-text'),
                opacity: '0.88',
                fontSize: 'clamp(1rem, 2.4vw, 1.2rem)',
                lineHeight: '1.7'
            }
        },
        {
            selectors: [selector('banner__actions')],
            declarations: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px'
            }
        },
        {
            selectors: [selector('banner__cta')],
            declarations: {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '999px',
                background: token('cta-background'),
                color: token('cta-color'),
                fontWeight: '600',
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 16px 32px rgba(56, 189, 248, 0.28)',
                transition: 'transform 160ms ease, box-shadow 160ms ease'
            }
        },
        {
            selectors: [`${selector('banner__cta')}:hover`],
            declarations: {
                transform: 'translateY(-2px)',
                boxShadow: '0 20px 34px rgba(56, 189, 248, 0.35)'
            }
        },
        {
            selectors: [selector('banner__media')],
            declarations: {
                position: 'relative',
                minWidth: 'min(320px, 100%)',
                width: 'min(420px, 100%)',
                minHeight: '260px',
                borderRadius: 'clamp(20px, 4vw, 32px)',
                overflow: 'hidden',
                background: 'radial-gradient(circle at 30% 20%, rgba(56,189,248,0.35), rgba(14,165,233,0.05))',
                boxShadow: 'inset 0 0 0 1px rgba(56, 189, 248, 0.18)'
            }
        },
        {
            selectors: [`${selector('banner__media')} img`],
            declarations: {
                position: 'absolute',
                inset: '0',
                width: '100%',
                height: '100%',
                objectFit: 'cover'
            }
        },
        {
            selectors: [selector('banner__media-fallback')],
            declarations: {
                position: 'absolute',
                inset: '0',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.24), rgba(14, 165, 233, 0.05))'
            }
        },
        {
            selectors: [selector('image')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }
        },
        {
            selectors: [selector('image__frame')],
            declarations: {
                position: 'relative',
                width: '100%',
                paddingTop: '62%',
                borderRadius: token('image-radius'),
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.65), rgba(56, 189, 248, 0.12))',
                boxShadow: 'inset 0 0 0 1px rgba(148, 163, 184, 0.16)'
            }
        },
        {
            selectors: [`${selector('image__frame')} img`],
            declarations: {
                position: 'absolute',
                inset: '0',
                width: '100%',
                height: '100%',
                objectFit: 'cover'
            }
        },
        {
            selectors: [selector('image__label')],
            declarations: {
                fontSize: '0.75rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: token('muted-color')
            }
        },
        {
            selectors: [selector('image__caption')],
            declarations: {
                color: token('muted-color'),
                lineHeight: '1.6',
                fontSize: '0.95rem'
            }
        },
        {
            selectors: [selector('image__credit')],
            declarations: {
                fontSize: '0.78rem',
                color: 'rgba(148, 163, 184, 0.7)'
            }
        },
        {
            selectors: [selector('rich-text')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
            }
        },
        {
            selectors: [selector('rich-text__badge')],
            declarations: {
                alignSelf: 'flex-start',
                padding: '6px 14px',
                borderRadius: '999px',
                background: 'rgba(56, 189, 248, 0.18)',
                color: token('accent-color'),
                fontSize: '0.75rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: '600'
            }
        },
        {
            selectors: [selector('rich-text__title')],
            declarations: {
                margin: '0',
                fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                fontWeight: '600',
                lineHeight: '1.25'
            }
        },
        {
            selectors: [selector('rich-text__lead')],
            declarations: {
                fontSize: 'clamp(1rem, 2.2vw, 1.2rem)',
                color: token('muted-color'),
                lineHeight: '1.7'
            }
        },
        {
            selectors: [selector('rich-text__body')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                color: token('muted-color'),
                lineHeight: '1.7',
                fontSize: '1rem'
            }
        },
        {
            selectors: [`${selector('rich-text__body')} p`],
            declarations: {
                margin: '0'
            }
        },
        {
            selectors: [selector('rich-text__list')],
            declarations: {
                margin: '4px 0 0',
                paddingLeft: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                color: token('muted-color')
            }
        },
        {
            selectors: [selector('rich-text__quote')],
            declarations: {
                margin: '8px 0 0',
                padding: '20px 24px',
                borderLeft: '3px solid ' + token('accent-color'),
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '16px',
                fontStyle: 'italic',
                color: token('text-color')
            }
        },
        {
            selectors: [selector('rich-text__quote-author')],
            declarations: {
                display: 'block',
                marginTop: '12px',
                color: token('muted-color'),
                fontStyle: 'normal',
                fontSize: '0.9rem'
            }
        },
        {
            selectors: [selector('rich-text__actions')],
            declarations: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px'
            }
        },
        {
            selectors: [selector('calendar')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                width: '100%',
                maxWidth: token('calendar-max-width'),
                margin: '0 auto'
            }
        },
        {
            selectors: [selector('calendar__header')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
            }
        },
        {
            selectors: [selector('calendar__month')],
            declarations: {
                margin: '0',
                fontSize: 'clamp(1.4rem, 2.4vw, 1.8rem)',
                fontWeight: '600'
            }
        },
        {
            selectors: [selector('calendar__description')],
            declarations: {
                color: token('muted-color'),
                fontSize: '0.95rem'
            }
        },
        {
            selectors: [selector('calendar__weekdays'), selector('calendar__days')],
            declarations: {
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: '12px'
            }
        },
        {
            selectors: [selector('calendar__weekday')],
            declarations: {
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                textAlign: 'center',
                color: token('muted-color'),
                padding: '8px 0'
            }
        },
        {
            selectors: [selector('calendar__day')],
            declarations: {
                minHeight: '92px',
                borderRadius: '18px',
                border: '1px solid rgba(148, 163, 184, 0.14)',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.2)'
            }
        },
        {
            selectors: [`${selector('calendar__day')}.is-empty`],
            declarations: {
                background: 'transparent',
                border: '1px dashed rgba(148, 163, 184, 0.16)',
                boxShadow: 'none'
            }
        },
        {
            selectors: [`${selector('calendar__day')}.has-event`],
            declarations: {
                background: token('calendar-accent-bg'),
                borderColor: 'transparent',
                boxShadow: 'inset 0 0 0 1px rgba(56, 189, 248, 0.25)'
            }
        },
        {
            selectors: [selector('calendar__day-number')],
            declarations: {
                fontWeight: '600',
                fontSize: '1rem',
                color: token('text-color')
            }
        },
        {
            selectors: [`${selector('calendar__day')}.has-event ${selector('calendar__day-number')}`],
            declarations: {
                color: token('calendar-accent-color')
            }
        },
        {
            selectors: [selector('calendar__event')],
            declarations: {
                fontSize: '0.85rem',
                color: token('muted-color'),
                lineHeight: '1.4'
            }
        },
        {
            selectors: [selector('calendar__legend')],
            declarations: {
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                color: token('muted-color'),
                fontSize: '0.85rem'
            }
        },
        {
            selectors: [selector('calendar__legend') + ' span'],
            declarations: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
            }
        },
        {
            selectors: [selector('calendar__legend-dot')],
            declarations: {
                width: '12px',
                height: '12px',
                borderRadius: '999px',
                background: token('calendar-accent-bg'),
                boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.25)'
            }
        },
        {
            selectors: [selector('audio')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
            }
        },
        {
            selectors: [selector('audio__subtitle')],
            declarations: {
                color: token('muted-color'),
                fontSize: '0.95rem',
                lineHeight: '1.65'
            }
        },
        {
            selectors: [selector('audio__list')],
            declarations: {
                display: 'grid',
                gap: '14px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
            }
        },
        {
            selectors: [selector('audio__card')],
            declarations: {
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gridTemplateRows: 'auto auto',
                gap: '4px 10px',
                padding: '8px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(30,41,59,0.58) 100%)',
                border: '1px solid rgba(148, 163, 184, 0.12)',
                boxShadow: '0 10px 20px rgba(2, 6, 23, 0.24)',
                alignItems: 'center'
            }
        },
        {
            selectors: [selector('audio__meta')],
            declarations: {
                gridColumn: '1 / 2',
                gridRow: '1 / 2',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }
        },
        {
            selectors: [selector('audio__title')],
            declarations: {
                fontSize: '1.05rem',
                fontWeight: '600',
                color: token('text-color'),
                margin: '0'
            }
        },
        {
            selectors: [selector('audio__artist')],
            declarations: {
                color: token('muted-color'),
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
            }
        },
        {
            selectors: [selector('audio__wave')],
            declarations: {
                gridColumn: '1 / 2',
                gridRow: '2 / 3',
                position: 'relative',
                height: '50px',
                borderRadius: '10px',
                overflow: 'hidden',
                background: 'linear-gradient(180deg, rgba(15,23,42,0.58) 0%, rgba(15,23,42,0.2) 100%)',
                border: '1px solid rgba(148, 163, 184, 0.1)'
            }
        },
        {
            selectors: [selector('audio__canvas')],
            declarations: {
                width: '100%',
                height: '100%',
                display: 'block'
            }
        },
        {
            selectors: [selector('audio__progress')],
            declarations: {
                position: 'absolute',
                left: '0',
                top: '0',
                bottom: '0',
                width: '0%',
                background: 'linear-gradient(90deg, rgba(56,189,248,0.25) 0%, rgba(125,211,252,0.1) 100%)',
                pointerEvents: 'none'
            }
        },
        {
            selectors: [selector('audio__wave-message')],
            declarations: {
                position: 'absolute',
                inset: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                color: token('muted-color'),
                padding: '0 16px',
                textAlign: 'center'
            }
        },
        {
            selectors: [selector('audio__controls')],
            declarations: {
                gridColumn: '2 / 3',
                gridRow: '1 / 3',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                alignItems: 'stretch',
                minWidth: '84px'
            }
        },
        {
            selectors: [selector('audio__button')],
            declarations: {
                padding: '6px 0',
                borderRadius: '10px',
                border: '1px solid transparent',
                background: token('accent-color'),
                color: '#020617',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'transform 160ms ease, box-shadow 160ms ease'
            }
        },
        {
            selectors: [selector('audio__button') + '--ghost'],
            declarations: {
                background: 'transparent',
                color: token('muted-color'),
                borderColor: 'rgba(148,163,184,0.25)',
                padding: '6px 0'
            }
        },
        {
            selectors: [selector('audio__time')],
            declarations: {
                fontSize: '0.78rem',
                color: token('muted-color'),
                textAlign: 'center'
            }
        },
        {
            selectors: [selector('audio__error')],
            declarations: {
                fontSize: '0.8rem',
                color: '#fca5a5',
                marginTop: '0'
            }
        },
        {
            selectors: [selector('video')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '24px'
            }
        },
        {
            selectors: [selector('video__subtitle')],
            declarations: {
                color: token('muted-color'),
                fontSize: '0.95rem',
                lineHeight: '1.6'
            }
        },
        {
            selectors: [selector('video__list')],
            declarations: {
                display: 'grid',
                gap: '18px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
            }
        },
        {
            selectors: [selector('video__card')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '18px',
                borderRadius: '18px',
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
                boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.25)'
            }
        },
        {
            selectors: [selector('video__media')],
            declarations: {
                width: '100%',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.12)',
                background: 'black'
            }
        },
        {
            selectors: [selector('video__title')],
            declarations: {
                fontSize: '1.05rem',
                fontWeight: '600',
                color: token('text-color'),
                margin: '0'
            }
        },
        {
            selectors: [selector('video__description')],
            declarations: {
                color: token('muted-color'),
                fontSize: '0.9rem',
                lineHeight: '1.5'
            }
        },
        {
            selectors: [selector('contact')],
            declarations: {
                display: 'grid',
                gap: '20px'
            }
        },
        {
            selectors: [selector('contact__subtitle')],
            declarations: {
                color: token('muted-color'),
                fontSize: '0.95rem',
                lineHeight: '1.6'
            }
        },
        {
            selectors: [selector('contact__form')],
            declarations: {
                display: 'grid',
                gap: '16px'
            }
        },
        {
            selectors: [selector('contact__row')],
            declarations: {
                display: 'grid',
                gap: '16px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
            }
        },
        {
            selectors: [selector('contact__field')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
            }
        },
        {
            selectors: [selector('contact__label')],
            declarations: {
                fontSize: '0.85rem',
                color: token('muted-color'),
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
            }
        },
        {
            selectors: [selector('contact__input'), selector('contact__textarea')],
            declarations: {
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: token('text-color'),
                fontSize: '0.95rem'
            }
        },
        {
            selectors: [selector('contact__textarea')],
            declarations: {
                minHeight: '160px',
                resize: 'vertical'
            }
        },
        {
            selectors: [selector('contact__submit')],
            declarations: {
                justifySelf: 'flex-start',
                padding: '12px 24px',
                borderRadius: '999px',
                border: 'none',
                background: token('accent-color'),
                color: '#020617',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'transform 160ms ease, box-shadow 160ms ease'
            }
        },
        {
            selectors: [selector('contact__submit') + ':hover'],
            declarations: {
                transform: 'translateY(-1px)',
                boxShadow: '0 12px 24px rgba(56, 189, 248, 0.28)'
            }
        },
        {
            selectors: [selector('contact__message')],
            declarations: {
                fontSize: '0.9rem',
                color: token('muted-color')
            }
        },
        {
            selectors: [selector('faq')],
            declarations: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }
        },
        {
            selectors: [selector('faq__item')],
            declarations: {
                borderRadius: '16px',
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
                padding: '18px 22px',
                cursor: 'pointer',
                transition: 'border-color 160ms ease, box-shadow 160ms ease'
            }
        },
        {
            selectors: [selector('faq__item') + '.is-open'],
            declarations: {
                borderColor: token('accent-color'),
                boxShadow: '0 18px 32px rgba(56, 189, 248, 0.12)'
            }
        },
        {
            selectors: [selector('faq__question')],
            declarations: {
                margin: '0',
                fontSize: '1.05rem',
                fontWeight: '600',
                color: token('text-color')
            }
        },
        {
            selectors: [selector('faq__answer')],
            declarations: {
                marginTop: '10px',
                fontSize: '0.95rem',
                color: token('muted-color'),
                lineHeight: '1.6',
                display: 'none'
            }
        },
        {
            selectors: [selector('faq__answer') + '.is-open'],
            declarations: {
                display: 'block'
            }
        }
    ];
}

function buildMediaStyleRules(helpers) {
    const { selector, token } = helpers;
    return [
        {
            query: '(max-width: 1024px)',
            rules: [
                {
                    selectors: [selector('calendar__weekdays')],
                    declarations: {
                        display: 'none'
                    }
                },
                {
                    selectors: [selector('calendar__days')],
                    declarations: {
                        gridTemplateColumns: 'repeat(auto-fit, minmax(' + token('calendar-card-min-width') + ', 1fr))'
                    }
                },
                {
                    selectors: [selector('calendar__day')],
                    declarations: {
                        minHeight: '120px'
                    }
                },
                {
                    selectors: [`${selector('calendar__day')}.is-empty`],
                    declarations: {
                        display: 'none'
                    }
                }
            ]
        },
        {
            query: '(max-width: 860px)',
            rules: [
                {
                    selectors: [selector('banner__layout')],
                    declarations: {
                        flexDirection: 'column',
                        alignItems: 'flex-start'
                    }
                },
                {
                    selectors: [selector('banner__media')],
                    declarations: {
                        width: '100%'
                    }
                },
                {
                    selectors: [selector('audio__list')],
                    declarations: {
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
                    }
                },
                {
                    selectors: [selector('video__list')],
                    declarations: {
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
                    }
                }
            ]
        },
        {
            query: '(max-width: 640px)',
            rules: [
                {
                    selectors: [selector('page')],
                    declarations: {
                        padding: 'clamp(20px, 6vw, 40px)'
                    }
                },
                {
                    selectors: [selector('calendar__weekdays'), selector('calendar__days')],
                    declarations: {
                        gap: '8px'
                    }
                },
                {
                    selectors: [selector('calendar__day')],
                    declarations: {
                        minHeight: '80px',
                        padding: '10px'
                    }
                },
                {
                    selectors: [selector('audio__list')],
                    declarations: {
                        gridTemplateColumns: '1fr'
                    }
                },
                {
                    selectors: [selector('video__list')],
                    declarations: {
                        gridTemplateColumns: '1fr'
                    }
                },
                {
                    selectors: [selector('contact__row')],
                    declarations: {
                        gridTemplateColumns: '1fr'
                    }
                }
            ]
        }
    ];
}

function camelToKebab(input) {
    return input.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

function declarationsToString(declarations) {
    return Object.entries(declarations)
        .map(([property, value]) => `${camelToKebab(property)}: ${value};`)
        .join('');
}

function buildCssText(helpers) {
    const baseRules = buildBaseStyleRules(helpers).map((rule) => {
        const selector = rule.selectors.join(',');
        return `${selector}{${declarationsToString(rule.declarations)}}`;
    }).join('');

    const mediaRules = buildMediaStyleRules(helpers).map((media) => {
        const content = media.rules.map((rule) => {
            const selector = rule.selectors.join(',');
            return `${selector}{${declarationsToString(rule.declarations)}}`;
        }).join('');
        return `@media ${media.query}{${content}}`;
    }).join('');

    return baseRules + mediaRules;
}

function ensureStyles(namespace) {
    const helpers = createHelpers(namespace);
    if (STYLE_REGISTRY.has(helpers.namespace)) return;

    const styleId = `${STYLE_PREFIX}-${helpers.namespace}`;
    if (document.getElementById(styleId)) {
        STYLE_REGISTRY.set(helpers.namespace, true);
        return;
    }

    const parent = document.head || document.getElementsByTagName('head')[0] || 'head';
    $('style', {
        id: styleId,
        parent,
        text: buildCssText(helpers)
    });

    STYLE_REGISTRY.set(helpers.namespace, true);
}

function themeToCssVars(theme, namespace) {
    return {
        [`--${namespace}-page-bg`]: theme.pageBackground,
        [`--${namespace}-text-color`]: theme.textColor,
        [`--${namespace}-font-family`]: theme.fontFamily,
        [`--${namespace}-section-gap`]: theme.sectionGap,
        [`--${namespace}-grid-gap`]: theme.gridGap,
        [`--${namespace}-max-width`]: theme.maxWidth,
        [`--${namespace}-min-column`]: theme.minColumnWidth,
        [`--${namespace}-block-bg`]: theme.blockBackground,
        [`--${namespace}-block-padding`]: theme.blockPadding,
        [`--${namespace}-block-radius`]: theme.blockRadius,
        [`--${namespace}-block-border`]: theme.blockBorder,
        [`--${namespace}-block-shadow`]: theme.blockShadow,
        [`--${namespace}-block-blur`]: theme.blockBlur,
        [`--${namespace}-block-gap`]: theme.blockContentGap,
        [`--${namespace}-muted-color`]: theme.mutedColor,
        [`--${namespace}-accent-color`]: theme.accentColor,
        [`--${namespace}-banner-gradient`]: theme.bannerBackground,
        [`--${namespace}-banner-text`]: theme.bannerTextColor,
        [`--${namespace}-banner-overlay`]: theme.bannerOverlay,
        [`--${namespace}-cta-background`]: theme.ctaBackground,
        [`--${namespace}-cta-color`]: theme.ctaColor,
        [`--${namespace}-image-radius`]: theme.imageRadius,
        [`--${namespace}-calendar-grid`]: theme.calendarGridColor,
        [`--${namespace}-calendar-accent-bg`]: theme.calendarAccentBackground,
        [`--${namespace}-calendar-accent-color`]: theme.calendarAccentColor,
        [`--${namespace}-calendar-max-width`]: theme.calendarMaxWidth,
        [`--${namespace}-calendar-card-min-width`]: theme.calendarCardMinWidth
    };
}

function applyThemeVars(node, theme, namespace) {
    const vars = themeToCssVars(theme, namespace);
    Object.keys(vars).forEach((key) => {
        const value = vars[key];
        if (value != null) {
            node.style.setProperty(key, value);
        }
    });
}

function createBlockWrapper(type, container, classNameFn, css = {}) {
    return $('article', {
        class: `${classNameFn('block')} ${classNameFn(`block--${type}`)}`,
        parent: container,
        css
    });
}

function registerBlockType(type, renderer) {
    if (typeof type !== 'string' || !type.trim() || typeof renderer !== 'function') {
        console.warn('[ModularBlocks] Impossible de créer le type "' + type + '"');
        return;
    }
    BLOCK_RENDERERS.set(type.trim(), renderer);
}

function renderBlock(container, definition, theme, context) {
    if (!definition || !definition.type) return null;
    const renderer = BLOCK_RENDERERS.get(definition.type);
    if (!renderer) {
        console.warn('[ModularBlocks] Type de bloc inconnu:', definition.type);
        return null;
    }
    return renderer({
        container,
        data: definition.data || {},
        theme,
        definition,
        context
    });
}

function renderBanner({ container, data, context }) {
    const { className } = context;
    const css = {};
    if (data.background) css.background = data.background;
    if (data.textColor) css.color = data.textColor;
    const block = createBlockWrapper('banner', container, className, css);

    const layout = $('div', {
        class: className('banner__layout'),
        parent: block
    });

    const copy = $('div', {
        class: className('banner__copy'),
        parent: layout
    });

    if (data.eyebrow) {
        $('span', {
            class: className('banner__eyebrow'),
            parent: copy,
            text: data.eyebrow
        });
    }

    if (data.title) {
        $('h1', {
            class: className('banner__title'),
            parent: copy,
            text: data.title
        });
    }

    if (data.subtitle) {
        $('p', {
            class: className('banner__subtitle'),
            parent: copy,
            text: data.subtitle
        });
    }

    const actions = Array.isArray(data.actions)
        ? data.actions
        : data.cta
            ? [data.cta]
            : [];

    if (actions.length) {
        const actionsRow = $('div', {
            class: className('banner__actions'),
            parent: copy
        });

        actions.forEach((action) => {
            if (!action || !action.label) return;
            const tag = action.href ? 'a' : 'button';
            const attrs = action.href
                ? { href: action.href, target: action.target || '_self', rel: action.rel || undefined }
                : { type: 'button' };

            const button = $(tag, {
                class: className('banner__cta'),
                parent: actionsRow,
                text: action.label,
                attrs,
                onClick: typeof action.onClick === 'function' ? action.onClick : undefined,
                css: action.css || undefined
            });

            if (action.icon) {
                $('span', {
                    parent: button,
                    text: action.icon,
                    css: {
                        fontSize: '1.1rem'
                    }
                });
            }
        });
    }

    if (data.media !== false) {
        const mediaWrapper = $('div', {
            class: className('banner__media'),
            parent: layout,
            css: data.mediaCss || undefined
        });

        const media = data.media || data.image;
        if (media && media.src) {
            $('img', {
                parent: mediaWrapper,
                attrs: {
                    src: media.src,
                    alt: media.alt || ''
                }
            });
        } else {
            $('div', {
                class: className('banner__media-fallback'),
                parent: mediaWrapper
            });
        }
    }

    return block;
}

function renderImage({ container, data, context }) {
    const { className } = context;
    const block = createBlockWrapper('image', container, className, data.css || undefined);

    if (data.label) {
        $('span', {
            class: className('image__label'),
            parent: block,
            text: data.label
        });
    }

    const aspectRatio = typeof data.aspectRatio === 'number'
        ? data.aspectRatio + '%'
        : data.aspectRatio || data.ratio || '62%';

    const frame = $('div', {
        class: className('image__frame'),
        parent: block,
        css: {
            paddingTop: aspectRatio
        }
    });

    if (data.src) {
        $('img', {
            parent: frame,
            attrs: {
                src: data.src,
                alt: data.alt || ''
            }
        });
    } else {
        $('div', {
            class: className('banner__media-fallback'),
            parent: frame
        });
    }

    if (data.caption) {
        $('p', {
            class: className('image__caption'),
            parent: block,
            text: data.caption
        });
    }

    if (data.credit) {
        $('span', {
            class: className('image__credit'),
            parent: block,
            text: data.credit
        });
    }

    return block;
}

function renderRichText({ container, data, context }) {
    const { className } = context;
    const block = createBlockWrapper('rich-text', container, className, data.css || undefined);

    if (data.badge) {
        $('span', {
            class: className('rich-text__badge'),
            parent: block,
            text: data.badge
        });
    }

    if (data.title) {
        const headingTag = data.headingTag && typeof data.headingTag === 'string'
            ? data.headingTag
            : 'h2';

        $(headingTag, {
            class: className('rich-text__title'),
            parent: block,
            text: data.title
        });
    }

    if (data.lead) {
        $('p', {
            class: className('rich-text__lead'),
            parent: block,
            text: data.lead
        });
    }

    const paragraphs = Array.isArray(data.body)
        ? data.body
        : data.body
            ? [data.body]
            : [];

    if (paragraphs.length) {
        const body = $('div', {
            class: className('rich-text__body'),
            parent: block
        });

        paragraphs.forEach((text) => {
            if (typeof text !== 'string') return;
            $('p', {
                parent: body,
                text
            });
        });
    }

    if (Array.isArray(data.listItems) && data.listItems.length) {
        const list = $('ul', {
            class: className('rich-text__list'),
            parent: block
        });

        data.listItems.forEach((item) => {
            if (!item) return;
            $('li', {
                parent: list,
                text: typeof item === 'string' ? item : String(item)
            });
        });
    }

    if (data.quote) {
        const quoteText = typeof data.quote === 'string' ? data.quote : data.quote.text;
        if (quoteText) {
            const quote = $('blockquote', {
                class: className('rich-text__quote'),
                parent: block,
                text: quoteText
            });

            if (data.quote.author) {
                $('cite', {
                    class: className('rich-text__quote-author'),
                    parent: quote,
                    text: data.quote.author
                });
            }
        }
    }

    const actions = Array.isArray(data.actions) ? data.actions : [];
    if (actions.length) {
        const actionsRow = $('div', {
            class: className('rich-text__actions'),
            parent: block
        });

        actions.forEach((action) => {
            if (!action || !action.label) return;
            const tag = action.href ? 'a' : 'button';
            const attrs = action.href
                ? { href: action.href, target: action.target || '_self', rel: action.rel || undefined }
                : { type: 'button' };

            $(tag, {
                class: className('banner__cta'),
                parent: actionsRow,
                text: action.label,
                attrs,
                onClick: typeof action.onClick === 'function' ? action.onClick : undefined,
                css: action.css || undefined
            });
        });
    }

    return block;
}

function buildCalendarDays(config = {}) {
    const totalDays = Number.isFinite(config.totalDays) ? config.totalDays : 30;
    const startOffset = Number.isFinite(config.startOffset) ? config.startOffset : 0;
    const days = [];
    const eventMap = new Map();

    if (Array.isArray(config.events)) {
        config.events.forEach((event) => {
            if (!event || !Number.isFinite(event.day)) return;
            eventMap.set(event.day, event);
        });
    }

    for (let i = 0; i < startOffset; i += 1) {
        days.push({ empty: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const event = eventMap.get(day);
        days.push({
            day,
            label: String(day),
            event
        });
    }

    return days;
}

function renderCalendar({ container, data, context }) {
    const { className } = context;
    const block = createBlockWrapper('calendar', container, className, data.css || undefined);

    if (data.fullWidth !== false) {
        block.style.gridColumn = '1 / -1';
    }

    const header = $('div', {
        class: className('calendar__header'),
        parent: block
    });

    if (data.month) {
        $('h3', {
            class: className('calendar__month'),
            parent: header,
            text: data.month
        });
    }

    if (data.description) {
        $('p', {
            class: className('calendar__description'),
            parent: header,
            text: data.description
        });
    }

    const weekdays = Array.isArray(data.weekdays) && data.weekdays.length === 7
        ? data.weekdays
        : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    const weekdaysRow = $('div', {
        class: className('calendar__weekdays'),
        parent: block
    });

    weekdays.forEach((dayLabel) => {
        $('div', {
            class: className('calendar__weekday'),
            parent: weekdaysRow,
            text: dayLabel
        });
    });

    const daysRow = $('div', {
        class: className('calendar__days'),
        parent: block
    });

    const days = Array.isArray(data.days) && data.days.length
        ? data.days
        : buildCalendarDays({
            totalDays: data.totalDays,
            startOffset: data.startOffset,
            events: data.events
        });

    days.forEach((dayInfo) => {
        if (!dayInfo) return;
        const isEmpty = dayInfo.empty || (!dayInfo.label && !Number.isFinite(dayInfo.day));
        const hasEvent = Boolean(dayInfo.event);
        const label = dayInfo.label || (Number.isFinite(dayInfo.day) ? String(dayInfo.day) : '');

        const cell = $('div', {
            class: `${className('calendar__day')}${isEmpty ? ' is-empty' : ''}${hasEvent ? ' has-event' : ''}`,
            parent: daysRow,
            css: dayInfo.css || undefined
        });

        if (isEmpty) return;

        $('span', {
            class: className('calendar__day-number'),
            parent: cell,
            text: label
        });

        const event = dayInfo.event;
        if (event) {
            const pieces = [];
            if (event.time) pieces.push(event.time);
            if (event.title || event.label) pieces.push(event.title || event.label);
            if (event.location) pieces.push(event.location);
            const eventText = pieces.join(' • ');

            if (eventText) {
                $('span', {
                    class: className('calendar__event'),
                    parent: cell,
                    text: eventText
                });
            }
        } else if (dayInfo.note) {
            $('span', {
                class: className('calendar__event'),
                parent: cell,
                text: dayInfo.note
            });
        }
    });

    if (Array.isArray(data.legend) && data.legend.length) {
        const legend = $('div', {
            class: className('calendar__legend'),
            parent: block
        });

        data.legend.forEach((item) => {
            if (!item || !item.label) return;
            const entry = $('span', {
                parent: legend
            });

            $('span', {
                class: className('calendar__legend-dot'),
                parent: entry,
                css: item.dotCss || undefined
            });

            $('span', {
                parent: entry,
                text: item.label
            });
        });
    }

    return block;
}

const AUDIO_CONTEXT_REF = { instance: null };

function getSharedAudioContext() {
    if (AUDIO_CONTEXT_REF.instance) return AUDIO_CONTEXT_REF.instance;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    AUDIO_CONTEXT_REF.instance = new Ctx();
    return AUDIO_CONTEXT_REF.instance;
}

function extractWaveformSamples(buffer, width) {
    const channel = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / width));
    const samples = new Float32Array(width);
    for (let i = 0; i < width; i += 1) {
        const start = i * blockSize;
        let max = 0;
        for (let j = 0; j < blockSize; j += 1) {
            const sampleIndex = start + j;
            if (sampleIndex >= channel.length) break;
            const value = Math.abs(channel[sampleIndex]);
            if (value > max) max = value;
        }
        samples[i] = max;
    }
    return samples;
}

function decodeAudioBuffer(context, arrayBuffer) {
    return new Promise((resolve, reject) => {
        try {
            const legacy = context.decodeAudioData(
                arrayBuffer,
                (decoded) => resolve(decoded),
                (error) => reject(error)
            );
            if (legacy && typeof legacy.then === 'function') {
                legacy.then(resolve, reject);
            }
        } catch (error) {
            reject(error);
        }
    });
}

function drawWaveform(canvas, samples, color) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    const middle = height / 2;
    for (let x = 0; x < width; x += 1) {
        const amplitude = samples[x] ?? 0;
        const barHeight = Math.max(1, amplitude * height * 0.9);
        ctx.fillRect(x, middle - barHeight / 2, 1, barHeight);
    }
}

function setupAudioCardWaveform({
    card,
    waveWrapper,
    canvas,
    progressBar,
    audioEl,
    track,
    context
}) {
    const resize = () => {
        const wrapperWidth = Math.max(1, canvas.parentElement.clientWidth);
        const deviceRatio = window.devicePixelRatio || 1;
        canvas.width = wrapperWidth * deviceRatio;
        canvas.height = 140 * deviceRatio;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        return canvas.width;
    };

    let currentSamples = null;
    let isDrawing = false;

    const accentColor = getComputedStyle(card).getPropertyValue(`--${context.namespace}-accent-color`).trim() || '#38bdf8';

    const renderWave = (samples) => {
        if (!samples) return;
        const drawWidth = resize();
        if (samples.length !== drawWidth) {
            const resampled = new Float32Array(drawWidth);
            const scale = samples.length / drawWidth;
            for (let i = 0; i < drawWidth; i += 1) {
                resampled[i] = samples[Math.min(samples.length - 1, Math.floor(i * scale))] || 0;
            }
            currentSamples = resampled;
        } else {
            currentSamples = samples;
        }
        drawWaveform(canvas, currentSamples, accentColor);
        isDrawing = false;
    };

    const showFallback = (message) => {
        const messageClass = context.className('audio__wave-message');
        canvas.style.display = 'none';
        progressBar.style.display = 'none';
        if (!waveWrapper.querySelector(`.${messageClass}`)) {
            $('div', {
                class: messageClass,
                parent: waveWrapper,
                text: message || 'Waveform indisponible sur ce navigateur.'
            });
        }
    };

    const analyze = async () => {
        if (isDrawing || currentSamples) return;
        const audioCtx = getSharedAudioContext();
        if (!audioCtx) {
            showFallback('Aperçu visuel non supporté par ce navigateur.');
            return;
        }
        isDrawing = true;
        try {
            const response = await fetch(track.src, {
                mode: track.fetchMode || 'same-origin'
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await decodeAudioBuffer(audioCtx, arrayBuffer);
            const width = resize();
            const samples = extractWaveformSamples(buffer, width);
            currentSamples = samples;
            drawWaveform(canvas, samples, accentColor);
        } catch (error) {
            console.warn('[ModularBlocks] Impossible de dessiner la waveform', error);
            showFallback('Waveform non disponible (format ou navigateur non supporté).');
            isDrawing = false;
        }
    };

    const target = canvas.parentElement;
    let observer = null;
    if (window.ResizeObserver) {
        observer = new ResizeObserver(() => renderWave(currentSamples));
        observer.observe(target);
    }

    analyze();

    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        if (audioEl.duration) {
            audioEl.currentTime = ratio * audioEl.duration;
        }
    });

    const updateProgress = () => {
        if (!audioEl.duration) {
            progressBar.style.width = '0%';
            return;
        }
        progressBar.style.width = `${(audioEl.currentTime / audioEl.duration) * 100}%`;
    };

    audioEl.addEventListener('timeupdate', updateProgress);
    audioEl.addEventListener('ended', updateProgress);

    return {
        teardown() {
            audioEl.removeEventListener('timeupdate', updateProgress);
            audioEl.removeEventListener('ended', updateProgress);
            if (observer && observer.unobserve) {
                observer.unobserve(target);
            }
        }
    };
}

function formatTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function renderAudioWave({ container, data, context }) {
    const { className, mediaRegistry } = context;
    const block = createBlockWrapper('audio', container, className, data.css || undefined);

    if (data.title) {
        $('h2', {
            class: className('audio__title'),
            parent: block,
            text: data.title
        });
    }

    if (data.subtitle) {
        $('p', {
            class: className('audio__subtitle'),
            parent: block,
            text: data.subtitle
        });
    }

    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (!tracks.length) {
        $('p', {
            class: className('audio__subtitle'),
            parent: block,
            text: 'Aucun fichier audio à afficher pour le moment.'
        });
        return block;
    }

    const list = $('div', {
        class: className('audio__list'),
        parent: block
    });

    tracks.forEach((track, index) => {
        if (!track || !track.src) return;
        const card = $('div', {
            class: className('audio__card'),
            parent: list
        });

        const meta = $('div', {
            class: className('audio__meta'),
            parent: card
        });

        $('h3', {
            class: className('audio__title'),
            parent: meta,
            text: track.title || `Piste ${index + 1}`
        });

        if (track.artist || track.description) {
            $('span', {
                class: className('audio__artist'),
                parent: meta,
                text: track.artist || track.description
            });
        }

        const waveWrapper = $('div', {
            class: className('audio__wave'),
            parent: card
        });

        const canvas = $('canvas', {
            class: className('audio__canvas'),
            parent: waveWrapper,
            attrs: { width: 600, height: 140 }
        });

        const progressBar = $('div', {
            class: className('audio__progress'),
            parent: waveWrapper
        });

        const controls = $('div', {
            class: className('audio__controls'),
            parent: card
        });

        const audioEl = $('audio', {
            parent: controls,
            attrs: {
                src: track.src,
                preload: track.preload || 'metadata'
            }
        });
        audioEl.style.display = 'none';

        const timeLabel = $('span', {
            class: className('audio__time'),
            parent: controls,
            text: '0:00'
        });

        const updateTimeLabel = () => {
            timeLabel.textContent = `${formatTime(audioEl.currentTime)} / ${formatTime(audioEl.duration || 0)}`;
        };

        audioEl.addEventListener('timeupdate', updateTimeLabel);
        audioEl.addEventListener('loadedmetadata', updateTimeLabel);
        audioEl.addEventListener('ended', () => {
            updateTimeLabel();
            playBtn.textContent = 'Lecture';
        });

        const playBtn = $('button', {
            class: className('audio__button'),
            parent: controls,
            text: 'Lecture'
        });

        const stopBtn = $('button', {
            class: `${className('audio__button')} ${className('audio__button')}--ghost`,
            parent: controls,
            text: 'Stop'
        });

        controls.insertBefore(playBtn, timeLabel);
        controls.insertBefore(stopBtn, timeLabel);

        const errorLabel = $('span', {
            class: className('audio__error'),
            parent: card,
            text: ''
        });

        const teardown = setupAudioCardWaveform({
            card,
            waveWrapper,
            canvas,
            progressBar,
            audioEl,
            track,
            context
        });

        const entry = { audioEl, playBtn, stopBtn, teardown };
        mediaRegistry.audios.add(entry);

        const pauseAllOthers = () => {
            mediaRegistry.audios.forEach((item) => {
                if (item === entry) return;
                item.audioEl.pause();
                item.playBtn.textContent = 'Lecture';
            });
        };

        playBtn.addEventListener('click', async () => {
            pauseAllOthers();
            errorLabel.textContent = '';
            const audioCtx = getSharedAudioContext();
            if (audioCtx && audioCtx.state === 'suspended') {
                try { await audioCtx.resume(); } catch (resumeError) { console.warn(resumeError); }
            }
            if (audioEl.paused) {
                try {
                    await audioEl.play();
                    playBtn.textContent = 'Pause';
                } catch (error) {
                    console.warn('[ModularBlocks][Audio] play error', error);
                    if (error && error.name === 'NotSupportedError') {
                        errorLabel.textContent = 'Lecture impossible : format non supporté par ce navigateur.';
                    } else {
                        errorLabel.textContent = 'Lecture impossible. Vérifiez le format du fichier.';
                    }
                }
            } else {
                audioEl.pause();
                playBtn.textContent = 'Lecture';
            }
        });

        stopBtn.addEventListener('click', () => {
            audioEl.pause();
            audioEl.currentTime = 0;
            playBtn.textContent = 'Lecture';
        });
    });

    return block;
}

function renderVideoPlayer({ container, data, context }) {
    const { className, mediaRegistry } = context;
    const block = createBlockWrapper('video', container, className, data.css || undefined);

    if (data.title) {
        $('h2', {
            class: className('video__title'),
            parent: block,
            text: data.title
        });
    }

    if (data.subtitle) {
        $('p', {
            class: className('video__subtitle'),
            parent: block,
            text: data.subtitle
        });
    }

    const videos = Array.isArray(data.videos) ? data.videos : [];
    if (!videos.length) {
        $('p', {
            class: className('video__subtitle'),
            parent: block,
            text: 'Aucune vidéo disponible pour le moment.'
        });
        return block;
    }

    const list = $('div', {
        class: className('video__list'),
        parent: block
    });

    videos.forEach((item, index) => {
        if (!item || !item.src) return;
        const card = $('div', {
            class: className('video__card'),
            parent: list
        });

        const videoEl = $('video', {
            class: className('video__media'),
            parent: card,
            attrs: {
                src: item.src,
                preload: item.preload || 'metadata',
                poster: item.poster || undefined,
                controls: '',
                playsinline: '',
                crossorigin: item.crossOrigin || undefined
            }
        });

        if (item.title || item.description) {
            $('h3', {
                class: className('video__title'),
                parent: card,
                text: item.title || `Vidéo ${index + 1}`
            });
        }

        if (item.description) {
            $('p', {
                class: className('video__description'),
                parent: card,
                text: item.description
            });
        }

        const errorNote = $('p', {
            class: className('audio__error'),
            parent: card,
            text: ''
        });

        const entry = { videoEl };
        mediaRegistry.videos.add(entry);

        videoEl.addEventListener('play', () => {
            mediaRegistry.videos.forEach((other) => {
                if (other.videoEl !== videoEl) {
                    other.videoEl.pause();
                }
            });
        });

        videoEl.addEventListener('error', () => {
            errorNote.textContent = "Lecture vidéo indisponible (format ou codec non supporté).";
        });
    });

    return block;
}

function renderContactModule({ container, data, context }) {
    const { className } = context;
    const block = createBlockWrapper('contact', container, className, data.css || undefined);

    if (data.title) {
        $('h2', {
            class: className('video__title'),
            parent: block,
            text: data.title
        });
    }

    if (data.subtitle) {
        $('p', {
            class: className('contact__subtitle'),
            parent: block,
            text: data.subtitle
        });
    }

    let messageLabel = null;

    const form = $('form', {
        class: className('contact__form'),
        parent: block,
        onSubmit: (event) => {
            event.preventDefault();
            const formData = new FormData(event.target);
            const payload = Object.fromEntries(formData.entries());
            if (typeof data.onSubmit === 'function') {
                data.onSubmit(payload);
            } else {
                console.log('[ModularBlocks][Contact]', payload);
            }
            if (messageLabel) {
                messageLabel.textContent = data.successMessage || 'Merci pour votre message !';
            }
            event.target.reset();
        }
    });

    const row = $('div', {
        class: className('contact__row'),
        parent: form
    });

    const addField = (parentNode, field) => {
        const wrapper = $('label', {
            class: className('contact__field'),
            parent: parentNode
        });

        $('span', {
            class: className('contact__label'),
            parent: wrapper,
            text: field.label
        });

        $(field.type === 'textarea' ? 'textarea' : 'input', {
            class: field.type === 'textarea' ? className('contact__textarea') : className('contact__input'),
            parent: wrapper,
            attrs: {
                name: field.name,
                type: field.type === 'textarea' ? undefined : (field.inputType || 'text'),
                placeholder: field.placeholder || undefined,
                required: field.required ? 'true' : undefined,
                rows: field.rows || undefined
            }
        });
    };

    const defaultFields = [
        { label: 'Nom', name: 'name', required: true, placeholder: 'Votre nom' },
        { label: 'Email', name: 'email', inputType: 'email', required: true, placeholder: 'vous@domaine.com' },
        { label: 'Message', name: 'message', type: 'textarea', required: true, placeholder: 'Parlez-nous de votre projet', rows: 6, fullWidth: true }
    ];

    const fields = Array.isArray(data.fields) && data.fields.length ? data.fields : defaultFields;

    fields.forEach((field) => {
        const targetParent = field.fullWidth ? form : row;
        addField(targetParent, field);
    });

    if (!row.childNodes.length) {
        row.remove();
    }

    $('button', {
        class: className('contact__submit'),
        parent: form,
        text: data.submitLabel || 'Envoyer'
    });

    messageLabel = $('p', {
        class: className('contact__message'),
        parent: block,
        text: data.helperText || ''
    });

    return block;
}

function renderFAQModule({ container, data, context }) {
    const { className } = context;
    const block = createBlockWrapper('faq', container, className, data.css || undefined);

    if (data.title) {
        $('h2', {
            class: className('video__title'),
            parent: block,
            text: data.title
        });
    }

    if (data.subtitle) {
        $('p', {
            class: className('contact__subtitle'),
            parent: block,
            text: data.subtitle
        });
    }

    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
        $('p', {
            class: className('contact__subtitle'),
            parent: block,
            text: 'Ajoutez des questions / réponses pour alimenter la FAQ.'
        });
        return block;
    }

    items.forEach((item) => {
        if (!item || !item.question) return;
        let isOpen = Boolean(item.open);
        const wrapper = $('div', {
            class: `${className('faq__item')}${isOpen ? ' is-open' : ''}`,
            parent: block,
            onClick: () => {
                isOpen = !isOpen;
                wrapper.classList.toggle('is-open', isOpen);
                answer.classList.toggle('is-open', isOpen);
            }
        });

        $('h3', {
            class: className('faq__question'),
            parent: wrapper,
            text: item.question
        });

        const answer = $('p', {
            class: `${className('faq__answer')}${isOpen ? ' is-open' : ''}`,
            parent: wrapper,
            text: item.answer || ''
        });
    });

    return block;
}

registerBlockType('banner', renderBanner);
registerBlockType('image', renderImage);
registerBlockType('rich-text', renderRichText);
registerBlockType('calendar', renderCalendar);
registerBlockType('audio-wave', renderAudioWave);
registerBlockType('video-player', renderVideoPlayer);
registerBlockType('contact', renderContactModule);
registerBlockType('faq', renderFAQModule);

function createModularBlocks(options = {}) {
    const helpers = createHelpers(options.namespace || DEFAULT_NAMESPACE);
    ensureStyles(helpers.namespace);

    const parent = options.parent || '#view';
    const tag = options.tag || 'section';
    const id = options.id || `${helpers.namespace}-blocks`;

    const theme = { ...DEFAULT_THEME, ...(options.theme || {}) };

    const cssVars = themeToCssVars(theme, helpers.namespace);
    const containerCss = { ...cssVars, ...(options.css || {}) };

    const container = $(tag, {
        id,
        class: helpers.className('page'),
        parent,
        css: containerCss
    });

    const grid = $('div', {
        class: helpers.className('grid'),
        parent: container,
        css: options.gridCss || undefined
    });

    const blocks = Array.isArray(options.blocks) ? options.blocks : [];

    const mediaRegistry = {
        audios: new Set(),
        videos: new Set()
    };

    const context = {
        root: container,
        grid,
        namespace: helpers.namespace,
        className: helpers.className,
        token: helpers.token,
        mediaRegistry
    };

    blocks.forEach((definition) => renderBlock(grid, definition, theme, context));

    let currentTheme = theme;

    return {
        root: container,
        grid,
        namespace: helpers.namespace,
        get theme() {
            return { ...currentTheme };
        },
        addBlock(blockDefinition) {
            if (!blockDefinition) return null;
            return renderBlock(grid, blockDefinition, currentTheme, context);
        },
        updateTheme(nextTheme = {}) {
            currentTheme = { ...currentTheme, ...nextTheme };
            applyThemeVars(container, currentTheme, helpers.namespace);
        }
    };
}

createModularBlocks.registerType = registerBlockType;
createModularBlocks.defaults = {
    theme: DEFAULT_THEME,
    namespace: DEFAULT_NAMESPACE,
    blocks: []
};

window.ModularBlocks = createModularBlocks;

export default createModularBlocks;
