import {describe,expect,it} from 'vitest';
import {applyDescriptionLink,descriptionMaxLength,formatDescription,normalizeDescriptionUrl,renderDescription} from '../src/lib/description-format';

const selected=(patch:ReturnType<typeof formatDescription>)=>patch.value.slice(patch.selectionStart,patch.selectionEnd);

describe('description rendering and safe links',()=>{
  it('renders simple emphasis, headings, lists, quotes and code structure',()=>{
    const html=renderDescription('## Acceptance criteria\n\n**Important** and *optional* and ~~old~~.\n\n- First\n- Second\n\n1. Build\n2. Review\n\n> A note\n\n`rule_name`\n\n```\nreturn true;\n```');
    for(const tag of ['<h2>Acceptance criteria</h2>','<strong>Important</strong>','<em>optional</em>','<s>old</s>','<ul>','<ol>','<blockquote>','<code>rule_name</code>','<pre><code>return true;'])expect(html).toContain(tag);
  });
  it('keeps legacy HTML and event payloads visible as text without executable markup',()=>{
    const html=renderDescription('Notes\n</textarea><img src=x onerror="window.pwned=true"><script>alert(1)</script>\n<b>legacy text</b>');
    expect(html).toContain('&lt;img');expect(html).toContain('&lt;script&gt;');expect(html).toContain('&lt;b&gt;legacy text&lt;/b&gt;');
    expect(html).not.toMatch(/<(?:script|img|textarea|b)(?:[\s>])/i);expect(html).toContain('<br>');
  });
  it('automatically links web addresses and emails, opening only a new isolated tab',()=>{
    const html=renderDescription('Visit https://example.com/docs?q=one&next=two or www.example.org, or write team@example.com.');
    expect(html.match(/<a\s/g)).toHaveLength(3);
    expect(html).toContain('href="https://example.com/docs?q=one&amp;next=two"');expect(html).toContain('href="http://www.example.org/"');expect(html).toContain('href="mailto:team@example.com"');
    expect(html.match(/target="_blank"/g)).toHaveLength(3);expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
  });
  it.each(['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>alert(1)</script>','vbscript:msgbox(1)','file:///etc/passwd','ftp://example.com/a','//example.com/path','/profile','java\nscript:alert(1)','java\tscript:alert(1)','javascript%3Aalert(1)','&#106;avascript:alert(1)','https://example.com/\u0000x'])('rejects unsafe or ambiguous editor URLs: %s',url=>{
    expect(normalizeDescriptionUrl(url)).toBeNull();
    expect(()=>applyDescriptionLink('Keep this',0,4,'unsafe',url)).toThrow('valid http, https or email link');
  });
  it('rejects dangerous Markdown schemes, including entity and whitespace obfuscation',()=>{
    const source='[one](javascript:alert(1)) [two](jAvAsCrIpT:alert(1)) [three](&#106;avascript:alert(1)) [four](java&#x73;cript:alert(1)) [five](data:text/html,test) [six](<java\tscript:alert(1)>)';
    expect(renderDescription(source)).not.toContain('<a ');
  });
  it('normalizes supported links without accepting empty hosts or invalid recipients',()=>{
    expect(normalizeDescriptionUrl(' HTTPS://Example.com/a ')).toBe('https://example.com/a');
    expect(normalizeDescriptionUrl('www.example.com/a')).toBe('https://www.example.com/a');
    expect(normalizeDescriptionUrl('mailto:team@example.com?subject=Feedback')).toBe('mailto:team@example.com?subject=Feedback');
    for(const url of ['https://','http:/example.com','mailto:','mailto:not-an-email','https://example.com/with space','https://example.com/"quoted"'])expect(normalizeDescriptionUrl(url)).toBeNull();
  });
  it('escapes link labels, titles and code while leaving image syntax non-executable',()=>{
    const value=applyDescriptionLink('',0,0,'Docs [v2] *safe*','https://example.com/a(b)?x=1&y=2').value;
    const html=renderDescription(value+'\n\n![image](https://example.com/pixel.png)\n\n```\n<script>window.pwned=true</script>\n```');
    expect(html).toContain('Docs [v2] *safe*</a>');expect(html).not.toContain('<em>safe</em>');expect(html).not.toContain('<img');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;window.pwned=true&lt;/script&gt;');
    expect(html).toContain('https://example.com/a(b)?x=1&amp;y=2');
    const titled=renderDescription('[Safe](https://example.com "&quot; onmouseover=&quot;alert(1)")');
    expect(titled).toContain('title="&quot; onmouseover=&quot;alert(1)"');
    expect([...titled.matchAll(/\s([\w:-]+)="[^"]*"/g)].map(match=>match[1])).not.toContain('onmouseover');
  });
});

describe('description toolbar edits',()=>{
  it('wraps only the selected content and preserves surrounding whitespace and cursor selection',()=>{
    const patch=formatDescription('Before hello after',7,12,'bold');
    expect(patch.value).toBe('Before **hello** after');expect(selected(patch)).toBe('hello');
    expect(patch.value).toBe('Before hello after'.slice(0,patch.replaceStart)+patch.text+'Before hello after'.slice(patch.replaceEnd));
    const whitespace=formatDescription('Before  hello  after',7,15,'italic');expect(whitespace.value).toBe('Before  *hello*  after');expect(selected(whitespace)).toBe('hello');
  });
  it('toggles emphasis without removing an independent bold or italic style',()=>{
    const bold=formatDescription('hello',0,5,'bold');expect(formatDescription(bold.value,bold.selectionStart,bold.selectionEnd,'bold').value).toBe('hello');
    const both=formatDescription(bold.value,bold.selectionStart,bold.selectionEnd,'italic');expect(both.value).toBe('***hello***');
    expect(formatDescription(both.value,both.selectionStart,both.selectionEnd,'italic').value).toBe('**hello**');
    expect(formatDescription(both.value,both.selectionStart,both.selectionEnd,'bold').value).toBe('*hello*');
  });
  it('inserts selected placeholder content for an empty editor',()=>{
    for(const action of ['bold','italic','code'] as const)expect(selected(formatDescription('',0,0,action))).toBe('text');
    expect(selected(formatDescription('',0,0,'heading'))).toBe('Heading');
    expect(selected(formatDescription('',0,0,'bullet'))).toBe('List item');
    expect(selected(formatDescription('',0,0,'numbered'))).toBe('List item');
    expect(selected(formatDescription('',0,0,'quote'))).toBe('Quote');
  });
  it('formats the current heading and keeps the caret inside the existing text',()=>{
    const patch=formatDescription('First\nTitle\nLast',8,8,'heading');expect(patch.value).toBe('First\n## Title\nLast');expect(patch.selectionStart).toBe(11);expect(patch.selectionEnd).toBe(11);
    const selectedHeading=formatDescription('Title',0,5,'heading');expect(selected(selectedHeading)).toBe('Title');
    expect(formatDescription(selectedHeading.value,selectedHeading.selectionStart,selectedHeading.selectionEnd,'heading').value).toBe('Title');
  });
  it('structures touched lines and leaves an unselected following line unchanged',()=>{
    const original='one\ntwo\nthree';
    const bullets=formatDescription(original,0,8,'bullet');expect(bullets.value).toBe('- one\n- two\n\nthree');
    expect(formatDescription(bullets.value,0,11,'bullet').value).toBe('one\ntwo\n\nthree');
    expect(formatDescription('one\n\ntwo',0,8,'numbered').value).toBe('1. one\n\n2. two');
    expect(formatDescription('- one\n- two',0,11,'numbered').value).toBe('1. one\n2. two');
    expect(formatDescription('one\ntwo',0,7,'quote').value).toBe('> one\n> two');
  });
  it('keeps an untouched following sentence outside formatted lists and quotes',()=>{
    const value='First item\nSecond item\nSee documentation';
    for(const action of ['bullet','numbered','quote'] as const){
      const formatted=formatDescription(value,0,22,action),html=renderDescription(formatted.value);
      expect(formatted.value).toContain('Second item\n\nSee documentation');
      expect(html).toMatch(/<\/(?:ul|ol|blockquote)>\n<p>See documentation<\/p>/);
      if(action!=='quote')expect(html.match(/<li>/g)).toHaveLength(2);
    }
  });
  it('uses a safe backtick delimiter and preserves multiline code content',()=>{
    const inline=formatDescription('rule`name',0,9,'code');expect(selected(inline)).toBe('rule`name');expect(renderDescription(inline.value)).toContain('<code>rule`name</code>');
    const source='first\nsecond',multiline=formatDescription(source,0,source.length,'code');expect(selected(multiline)).toBe(source);expect(renderDescription(multiline.value)).toContain('<pre><code>first\nsecond\n</code></pre>');
  });
  it('inserts a validated labelled link over the selected words without changing other text',()=>{
    const patch=applyDescriptionLink('Read the docs today',9,13,'Reference','https://example.com/docs(a)');
    expect(patch.value).toBe('Read the [Reference](<https://example.com/docs(a)>) today');expect(renderDescription(patch.value)).toContain('>Reference</a>');
  });
  it('normalizes reversed and invalid selection bounds instead of editing unrelated text',()=>{
    expect(formatDescription('hello',5,0,'bold').value).toBe('**hello**');
    const patch=formatDescription('hello',Infinity,Infinity,'bold');expect(patch.value).toBe('hello**text**');expect(selected(patch)).toBe('text');
  });
  it('rejects toolbar changes beyond the stored description limit without truncation',()=>{
    const exact='x'.repeat(descriptionMaxLength);expect(()=>formatDescription(exact,0,exact.length,'bold')).toThrow('at most 10,000');
    expect(()=>applyDescriptionLink(exact,0,1,'x','https://example.com')).toThrow('at most 10,000');expect(exact.length).toBe(descriptionMaxLength);
    const fits='x'.repeat(descriptionMaxLength-4);expect(formatDescription(fits,0,fits.length,'bold').value.length).toBe(descriptionMaxLength);
  });
});
