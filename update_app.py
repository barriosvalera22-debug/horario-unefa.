import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update DOM variables
content = re.sub(r"const panelFiltro = document\.getElementById\('panel-filtro'\);\n", "", content)
content = re.sub(r"const panelAdminFilters = document\.getElementById\('panel-admin-filters'\);\n", "", content)
content = content.replace("document.getElementById('select-career')", "document.getElementById('shared-select-career')")
content = content.replace("document.getElementById('select-semester')", "document.getElementById('shared-select-semester')")
content = content.replace("document.getElementById('select-section')", "document.getElementById('shared-select-section')")

# Add new DOM references for tabs and admin actions
content = content.replace("const btnDownloadPdf = document.getElementById('btn-download-pdf');", 
"""const btnDownloadPdf = document.getElementById('btn-download-pdf');
const adminTabsBar = document.getElementById('admin-tabs-bar');
const adminHorarioActions = document.getElementById('admin-horario-actions');
const profLegend = document.getElementById('prof-legend');
""")

# Remove old admin selects variables if they exist
content = re.sub(r"const adminCareerSel =.*?\n", "", content)
content = re.sub(r"const adminSemesterSel =.*?\n", "", content)
content = re.sub(r"const adminSectionSel =.*?\n", "", content)

# 2. setupProfessor and setupAdmin logic
setup_prof_new = """function setupProfessor() {
    document.getElementById('profile-role').className = 'text-[10px] font-bold text-unefagold uppercase tracking-wider';
    
    // Ocultar elementos de admin
    adminTabsBar.classList.add('hidden');
    adminHorarioActions.classList.add('hidden');
    adminScheduleView.classList.add('hidden');
    adminScheduleView.classList.remove('flex');
    btnDownloadPdf.classList.add('hidden');
    
    // Mostrar elementos de profesor
    profLegend.classList.remove('hidden');
    profLegend.classList.add('flex');
    schedulerCont.classList.remove('hidden');

    resetFilters();
}"""

setup_admin_new = """function setupAdmin() {
    document.getElementById('profile-role').className = 'text-[10px] font-bold text-red-500 uppercase tracking-wider';
    
    // Mostrar elementos de admin
    adminTabsBar.classList.remove('hidden');
    adminTabsBar.classList.add('flex');
    adminHorarioActions.classList.remove('hidden');
    adminHorarioActions.classList.add('flex');
    
    // Ocultar elementos de profesor
    profLegend.classList.add('hidden');
    profLegend.classList.remove('flex');
    schedulerCont.classList.add('hidden');

    resetFilters();
    initTabs();
}

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remover active de todas
            tabs.forEach(t => {
                t.classList.remove('active', 'border-unefablue', 'text-unefablue');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            // Activar esta
            tab.classList.add('active', 'border-unefablue', 'text-unefablue');
            tab.classList.remove('border-transparent', 'text-gray-500');
            
            // Ocultar todos los contenidos
            document.querySelectorAll('.tab-content').forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('block');
                c.style.opacity = 0;
            });
            // Mostrar destino
            const target = document.getElementById(tab.dataset.target);
            target.classList.remove('hidden');
            target.classList.add('block');
            setTimeout(() => target.style.opacity = 1, 10);
            
            // Renderizar datos si es necesario
            if (tab.dataset.target === 'tab-stats') setTimeout(renderStats, 100);
            if (tab.dataset.target === 'tab-users') renderUsersPanel();
            if (tab.dataset.target === 'tab-sections') renderSectionsPanel();
        });
    });
}"""

content = re.sub(r"function setupProfessor\(\) \{.*?(?=function setupAdmin)", setup_prof_new + "\n\n", content, flags=re.DOTALL)
content = re.sub(r"function setupAdmin\(\) \{.*?(?=// ═══════════════════════════ EVENTOS FILTROS PROFESOR ═══════════════════════════)", setup_admin_new + "\n\n", content, flags=re.DOTALL)


# 3. Simplify Filter Events (merge Prof and Admin logic since they share selects)
filter_events_new = """// ═══════════════════════════ EVENTOS FILTROS UNIFICADOS ═══════════════════════════
selectCareer.addEventListener('change', async (e) => {
    currentCareer = e.target.value;
    adminCareer = e.target.value;
    
    selectSemester.innerHTML = '<option value="" disabled selected>-- Elige semestre --</option>';
    SEMESTERS.forEach((s, i) => {
        const option = document.createElement('option');
        option.value = i; option.textContent = s;
        selectSemester.appendChild(option);
    });
    selectSemester.disabled = false;
    
    selectSection.innerHTML = '<option value="" disabled selected>-- Elige sección --</option>';
    selectSection.disabled = true;
    
    currentSemester = ''; currentSection = '';
    adminSemester = ''; adminSection = '';
    
    if (currentUser?.role === 'admin') {
        adminScheduleView.classList.add('hidden');
    } else {
        schedulerCont.style.opacity = '0.4';
        schedulerCont.style.pointerEvents = 'none';
        document.getElementById('progress-bar-wrap').classList.add('hidden');
    }
});

selectSemester.addEventListener('change', async (e) => {
    currentSemester = e.target.value;
    adminSemester = e.target.value;
    
    selectSection.innerHTML = '<option value="" disabled selected>-- Cargando secciones --</option>';
    selectSection.disabled = true;
    
    try {
        const res = await authFetch('/api/sections');
        const data = await res.json();
        const allSections = data.sections || [];
        
        const filtered = allSections.filter(s => s.career === currentCareer && parseInt(s.semester) === parseInt(currentSemester));
        
        selectSection.innerHTML = '<option value="" disabled selected>-- Elige sección --</option>';
        if (filtered.length === 0) {
            selectSection.innerHTML = '<option value="" disabled selected>No hay secciones creadas</option>';
        } else {
            filtered.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.code; opt.textContent = s.code;
                selectSection.appendChild(opt);
            });
            selectSection.disabled = false;
        }
    } catch(err) {
        console.error(err);
        selectSection.innerHTML = '<option value="" disabled selected>Error de conexión</option>';
    }
});

selectSection.addEventListener('change', async (e) => {
    currentSection = e.target.value;
    adminSection = e.target.value;
    
    if (currentUser?.role === 'admin') {
        renderAdminSchedule();
    } else {
        schedulerCont.style.opacity = '1';
        schedulerCont.style.pointerEvents = 'auto';
        renderScheduleGrid();
    }
});

function resetFilters() {
    currentCareer = ''; currentSemester = ''; currentSection = '';
    adminCareer = ''; adminSemester = ''; adminSection = '';
    selectCareer.value = '';
    selectSemester.innerHTML = '<option value="" disabled selected>-- Primero elige carrera --</option>';
    selectSemester.disabled = true;
    selectSection.innerHTML = '<option value="" disabled selected>-- Primero elige semestre --</option>';
    selectSection.disabled = true;
    
    if (currentUser?.role === 'admin') {
        adminScheduleView.classList.add('hidden');
        adminScheduleView.classList.remove('flex');
    } else {
        schedulerCont.style.opacity = '0.4';
        schedulerCont.style.pointerEvents = 'none';
        document.getElementById('progress-bar-wrap').classList.add('hidden');
    }
}
"""

content = re.sub(r"// ═══════════════════════════ EVENTOS FILTROS PROFESOR ═══════════════════════════.*?(?=// ═══════════════════════════ EVENTOS HORARIO \(PROFESOR\) ═══════════════════════════)", filter_events_new + "\n\n", content, flags=re.DOTALL)

# 4. Remove 'panel-users', 'stats-panel' show/hide from old buttons
content = re.sub(r"document\.getElementById\('btn-show-stats'\)\?\.addEventListener\('click', \(\) => \{.*?\}\);\n", "", content, flags=re.DOTALL)
content = re.sub(r"document\.getElementById\('btn-close-stats'\)\?\.addEventListener\('click', \(\) => \{.*?\}\);\n", "", content, flags=re.DOTALL)
content = re.sub(r"document\.getElementById\('btn-show-users'\)\?\.addEventListener\('click', renderUsersPanel\);\n", "", content, flags=re.DOTALL)
content = re.sub(r"document\.getElementById\('btn-close-users'\)\?\.addEventListener\('click', \(\) => \{.*?\}\);\n", "", content, flags=re.DOTALL)
content = re.sub(r"document\.getElementById\('btn-show-sections'\)\?\.addEventListener\('click', renderSectionsPanel\);\n", "", content, flags=re.DOTALL)
content = re.sub(r"document\.getElementById\('btn-close-sections'\)\?\.addEventListener\('click', \(\) => \{.*?\}\);\n", "", content, flags=re.DOTALL)

# Also remove admin-select-* references in Reset All
content = content.replace("document.getElementById('admin-select-career').value = '';", "")
content = content.replace("document.getElementById('admin-select-semester').value = '';", "")
content = content.replace("document.getElementById('admin-select-section').value = '';", "")
content = content.replace("document.getElementById('admin-select-semester').disabled = true;", "")
content = content.replace("document.getElementById('admin-select-section').disabled = true;", "")
content = content.replace("document.getElementById('btn-admin-view-schedule').disabled = true;", "")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
