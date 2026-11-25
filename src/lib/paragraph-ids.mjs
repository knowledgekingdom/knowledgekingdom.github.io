// Markdown plugin: give every real paragraph a stable id ("p-k3x9q2"), so readers can
// link to it (#p-k3x9q2). The id comes from the paragraph's own text, so it survives
// edits elsewhere in the section and only changes if that paragraph changes.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(6, '0').slice(-6);
};

export function paragraphIds() {
  return () => {
    const seen = new Set();
    return {
      name: 'paragraph-ids',
      element: {
        filter: ['p'],
        visit(node, ctx) {
          if (typeof node.properties?.id === 'string') return;
          const text = ctx.textContent(node).replace(/\s+/g, ' ').trim();
          if (text.length < 40) return; // captions, labels and one-liners don't need links
          let id = `p-${hash(text)}`;
          while (seen.has(id)) id += 'x';
          seen.add(id);
          ctx.setProperty(node, 'id', id);
        },
      },
    };
  };
}
