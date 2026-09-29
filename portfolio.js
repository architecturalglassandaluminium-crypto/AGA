/* Shared, read-only overview of the three existing project books. Editing stays in each company app. */
(function (root) {
    'use strict';

    const COMPANIES = {
        glass: { name: 'AGA · Glass & Aluminium', key: 'aga_projects' },
        plumbing: { name: 'APS · Plumbing', key: 'pipewise-projects' },
        coatings: { name: 'APC · Construction', key: 'apc-projects' }
    };

    function readBook(storage, key) {
        try {
            const value = JSON.parse(storage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (_) {
            return [];
        }
    }

    function collect(storage) {
        return Object.entries(COMPANIES).flatMap(([company, config]) =>
            readBook(storage, config.key).filter(project => project && typeof project === 'object').map(project => {
                const glass = company === 'glass';
                const items = glass ? (Array.isArray(project.windows) ? project.windows : [])
                    : (Array.isArray(project.items) ? project.items : []);
                const done = glass ? items.filter(item => item && (item.status === 'Project Completed' || item.status === 'Installed')).length
                    : items.filter(item => item && item.stage === 'Done').length;
                const complete = glass ? items.length > 0 && done === items.length : project.status === 'complete';
                const due = glass ? project.dueDate : project.end;
                return {
                    company, companyName: config.name, id: String(project.id || ''),
                    number: String(glass ? project.projectNumber || '' : project.id || ''),
                    name: String(glass ? project.projectName || '' : project.name || ''),
                    customer: String(glass ? project.customerName || '' : project.customer || project.customerName || ''),
                    site: String(glass ? project.siteAddress || '' : project.address || ''),
                    lead: String(glass ? '' : project.lead || ''),
                    start: String(glass ? '' : project.start || ''),
                    due: String(due || ''),
                    status: complete ? 'Complete' : glass ? (items.length ? 'In progress' : 'Planning')
                        : ({ planning: 'Planning', scheduled: 'Scheduled', 'in-progress': 'In progress', 'on-hold': 'On hold' }[project.status] || 'Planning'),
                    complete, done, total: items.length,
                    updatedAt: String(project.updatedAt || project.createdAt || '')
                };
            })
        );
    }

    function isOverdue(project, today) {
        return !project.complete && /^\d{4}-\d{2}-\d{2}$/.test(project.due) && project.due < today;
    }

    function filter(projects, company, status, search, today) {
        const query = search.trim().toLowerCase();
        return projects.filter(project =>
            (company === 'all' || project.company === company) &&
            (status === 'all' || (status === 'complete' && project.complete) ||
                (status === 'active' && !project.complete) ||
                (status === 'overdue' && isOverdue(project, today))) &&
            (!query || [project.name, project.number, project.customer, project.site, project.lead]
                .some(value => value.toLowerCase().includes(query)))
        );
    }

    const model = { collect, filter, isOverdue };
    if (typeof module !== 'undefined' && module.exports) module.exports = model;
    if (!root || !root.document) return;

    const doc = root.document;
    const el = id => doc.getElementById(id);
    const today = () => {
        const date = new Date();
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    };

    function text(tag, value, className) {
        const node = doc.createElement(tag);
        node.textContent = value;
        if (className) node.className = className;
        return node;
    }

    function open(company, id, create) {
        root.setTrade(company);
        if (company === 'glass') {
            root.switchView('projects');
            if (create) root.openNewProject();
            else if (id) root.editProject(id);
            return;
        }
        const frame = doc.querySelector('#tradeFrameHolder .trade-frame[src="trades/' + company + '/index.html"]');
        if (!frame) return;
        const navigate = () => {
            try {
                const app = frame.contentWindow;
                app.switchView('planning');
                if (create) app.newProject();
                else if (id) {
                    app.openPlanningProject(id);
                }
            } catch (error) {
                console.warn('Could not open company project', error);
            }
        };
        // A new iframe begins at about:blank (also 'complete'); wait for the app's entry point.
        // Polling also covers a cached frame whose load event raced past the listener.
        let attempts = 0;
        function whenReady() {
            if (frame.contentWindow && typeof frame.contentWindow.openPlanningProject === 'function') navigate();
            else if (++attempts < 100) root.setTimeout(whenReady, 100);
            else console.warn('Company planning app did not load');
        }
        whenReady();
    }

    function render() {
        const list = el('portfolioList');
        if (!list) return;
        const projects = collect(root.localStorage);
        const date = today();
        const visible = filter(projects, el('portfolioCompany').value, el('portfolioStatus').value, el('portfolioSearch').value, date)
            .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));

        const totals = el('portfolioTotals');
        totals.replaceChildren();
        for (const [label, value] of [
            ['Total projects', projects.length],
            ['Active', projects.filter(project => !project.complete).length],
            ['Overdue', projects.filter(project => isOverdue(project, date)).length],
            ['Complete', projects.filter(project => project.complete).length]
        ]) {
            const card = text('div', '', 'portfolio-stat');
            card.append(text('strong', value), text('span', label));
            totals.append(card);
        }

        const actions = el('portfolioActions');
        actions.replaceChildren();
        for (const [company, config] of Object.entries(COMPANIES)) {
            const button = text('button', '+ New ' + config.name.split(' · ')[0] + ' project', 'secondary-button');
            button.type = 'button';
            button.addEventListener('click', () => open(company, '', true));
            actions.append(button);
        }
        list.replaceChildren();
        if (!visible.length) {
            list.append(text('p', 'No projects match your filters. Create a project or change your search.', 'portfolio-empty'));
            return;
        }
        for (const project of visible) {
            const card = text('article', '', 'portfolio-card');
            const heading = text('div', '', 'portfolio-card-heading');
            const title = text('div', '');
            title.append(text('small', project.companyName), text('h3', project.name || 'Untitled project'));
            heading.append(title, text('span', isOverdue(project, date) ? 'Overdue' : project.status,
                'portfolio-badge' + (isOverdue(project, date) ? ' is-overdue' : '')));
            const meta = text('div', '', 'portfolio-meta');
            for (const [label, value] of [
                ['Number', project.number || '—'], ['Customer', project.customer || '—'],
                ['Site', project.site || '—'], ['Lead', project.lead || '—'],
                ['Start', project.start || '—'], ['Due', project.due || '—'],
                [project.company === 'glass' ? 'Windows' : 'Tasks', project.done + ' / ' + project.total + ' done']
            ]) meta.append(text('span', label + ': ' + value));
            const button = text('button', 'Open project', 'primary-button');
            button.type = 'button';
            button.addEventListener('click', () => open(project.company, project.id, false));
            card.append(heading, meta, button);
            list.append(card);
        }
    }

    root.renderPortfolio = render;
    function init() {
        ['portfolioCompany', 'portfolioStatus', 'portfolioSearch'].forEach(id =>
            el(id).addEventListener(id === 'portfolioSearch' ? 'input' : 'change', render));
        el('portfolioRefresh').addEventListener('click', render);
        root.addEventListener('storage', event => {
            if (Object.values(COMPANIES).some(company => company.key === event.key) && !el('portfolio-view').hidden) render();
        });
        if (!el('portfolio-view').hidden) render();
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : null);
