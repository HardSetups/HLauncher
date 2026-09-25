// Güvenli markdown (sözleşme §5): ham HTML HİÇ işlenmez — her şey React öğesi olarak
// kaçışlı çıkar (<script> düz metin görünür). Desteklenen alt küme: # başlıklar,
// paragraflar, - / * / 1. listeler, **kalın**, *italik*, `kod`, [metin](adres).
// Bağlantılar launcher'da açılmaz: ana süreç izin listesiyle (linkHosts) tarayıcıda açar.

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function Inline({ text, onLink }) {
  const parts = String(text).split(INLINE).filter((p) => p !== '');
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
    if (link) {
      const url = link[2];
      return /^https?:\/\//.test(url)
        ? <button key={i} type="button" className="md-link" onClick={() => onLink(url)} title={url}>{link[1]}</button>
        : <span key={i}>{link[1]}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

/** Satırları bloklara ayırır (saf): başlık, liste, paragraf. */
function toBlocks(source) {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of String(source || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (heading) { flushPara(); flushList(); blocks.push({ type: `h${heading[1].length}`, text: heading[2] }); continue; }
    if (bullet || ordered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.type !== kind) { flushList(); list = { type: kind, items: [] }; }
      list.items.push((bullet || ordered)[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export default function Markdown({ source, onLink, className = '' }) {
  const blocks = toBlocks(source);
  return (
    <div className={`md ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type;
          return <List key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} onLink={onLink} /></li>)}</List>;
        }
        const Tag = b.type === 'p' ? 'p' : b.type === 'h1' ? 'h3' : b.type === 'h2' ? 'h4' : 'h5';
        return <Tag key={i}><Inline text={b.text} onLink={onLink} /></Tag>;
      })}
    </div>
  );
}
