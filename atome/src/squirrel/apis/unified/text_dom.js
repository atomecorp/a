export const extractSemanticText = (textContainer) => {
    if (!textContainer) return '';
    const clone = textContainer.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => {
        br.replaceWith('\n');
    });
    clone.querySelectorAll('div').forEach((div) => {
        const text = div.textContent || '';
        div.replaceWith('\n' + text);
    });
    return (clone.textContent || '').replace(/^\n/, '');
};
