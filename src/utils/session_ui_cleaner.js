export const clearStaleSessionUI = () => {
    if (typeof document === 'undefined') return;

    const matrixRoot = document.getElementById('eve_project_matrix');
    if (matrixRoot) {
        matrixRoot.classList.remove('is-active');
        matrixRoot.style.display = 'none';
        matrixRoot.style.opacity = '0';

        const scroll = matrixRoot.querySelector('#eve_project_matrix_scroll');
        if (scroll) {
            scroll.innerHTML = '';
        }
    }

    const matrixTool = document.getElementById('_intuition_matrix');
    if (matrixTool) {
        delete matrixTool.dataset.simpleActive;
        delete matrixTool.dataset.activeTag;
        matrixTool.style.removeProperty('background');
    }

    const projectViews = document.querySelectorAll('[id^="project_view_"]');
    projectViews.forEach((view) => {
        view.style.display = 'none';
        view.style.visibility = 'hidden';
    });
};