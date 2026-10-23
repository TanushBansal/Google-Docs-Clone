const sanitize = require('sanitize-html');
    function fields(body) {
        if(typeof body.title !== 'string' || body.title.length > 200 || typeof body.content !== 'string') return null;
        return { title:body.title.trim() || 'Untitled document', content:sanitize(body.content, {
            allowedTags:sanitize.defaults.allowedTags.concat(['font','mark']),
            allowedAttributes:{ '*':['style'], font:['color','face','size'] },
            allowedStyles:{ '*':{
                color:[/^#[0-9a-f]{3,8}$/i,/^rgba?\([\d\s,.%]+\)$/i,/^[a-z]+$/i],
                'background-color':[/^#[0-9a-f]{3,8}$/i,/^rgba?\([\d\s,.%]+\)$/i,/^[a-z]+$/i],
                'text-align':[/^(left|right|center|justify)$/], 'font-family':[/^[\w\s,"'-]+$/],
                'font-size':[/^\d+(px|pt|em|rem|%)$/], 'font-weight':[/^(bold|normal|[1-9]00)$/],
                'font-style':[/^(italic|normal)$/], 'text-decoration':[/^(underline|line-through|none)$/]
            }}
        }), updatedAt:new Date().toISOString() };
    }

module.exports = fields;
