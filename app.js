const App = {
    // --- CONFIGURATION ---
    config: {
        firebaseUrl: "https://buscontrol-a94e7-default-rtdb.firebaseio.com", // ⚠️ ATENCIÓN: Reemplaza esto por tu misma URL de Firebase
        themeColors: {
            success: '#22C55E',
            danger: '#FB7185',
            accent: '#F97316',
            warning: '#FBBF24',
            textSecondary: '#94A3B8',
            borderColor: '#475569',
            bgCard: '#334155',
            sky: '#38BDF8',
            indigo: '#818CF8',
            violet: '#A78BFA',
            cyan: '#22D3EE'
        }
    },

    // --- STATE MANAGEMENT ---
    state: {
        data: {}, // Local cache for Firebase data
        charts: {} // Instances of Chart.js
    },

    // --- INITIALIZATION ---
    init() {
        App.pwa.init();
        App.mobile.init();
        App.update(); // Initial data load
    },

    // --- CORE LOGIC ---
    async update() {
        const success = await App.api.fetchDashboardData();
        if (!success) return;

        App.ui.updateHeader();
        App.ui.updateDashboardCards();
        App.charts.updateAll();
        App.ui.populateBusSelectors();

        // Refresh the currently active section's table data
        const activeSection = document.querySelector('.content-section.active');
        if (activeSection) {
            App.ui.showSection(activeSection.id, false); // false to prevent re-hiding other sections
        }
    },

    // --- API / DATA HANDLING ---
    api: {
        async fetchDashboardData() {
            try {
                const res = await fetch(`${App.config.firebaseUrl}/dashboard.json`, {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
                });
                if (!res.ok) throw new Error("Error en la respuesta de Firebase");
                App.state.data = await res.json() || {};
                return true;
            } catch (e) {
                console.error(e);
                alert("Error al cargar datos desde Firebase. Verifique la conexión y que el servidor esté activo.");
                return false;
            }
        }
    },

    // --- UI RENDERING & MANIPULATION ---
    ui: {
        showSection(sectionId, updateNav = true) {
            if (updateNav) {
                document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
                document.getElementById(sectionId).classList.add('active');

                document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
                document.querySelector(`li[onclick="App.ui.showSection('${sectionId}')"]`).classList.add('active');

                const titles = {
                    'dashboard': 'Resumen General', 'ingresos': 'Reporte de Ingresos',
                    'informe': 'Informe por Autobús', 'gastos': 'Reporte de Gastos',
                    'facturas': 'Facturas por Pagar', 'alarmas': 'Alarmas de Mantenimiento'
                };
                document.getElementById('page-title').innerText = titles[sectionId];
            }

            // Load table data for the specific section
            const tableLoaders = {
                'ingresos': App.tables.loadIngresos, 'informe': App.tables.loadInformeAutobus,
                'gastos': App.tables.loadGastos, 'facturas': App.tables.loadFacturas,
                'alarmas': App.tables.loadAlarmas
            };
            if (tableLoaders[sectionId]) {
                tableLoaderssectionId;
            }
        },

        updateHeader() {
            const { ultima_actualizacion = "Desconocida", resumen = {} } = App.state.data;
            const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;
            document.getElementById('last-sync').innerText = `☁️ Última sincronización: ${ultima_actualizacion} | Tasa: Bs. ${tasaCambio.toFixed(2)}`;
        },

        updateDashboardCards() {
            const { resumen = {}, gastos_mes = [] } = App.state.data;
            const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;
            const get = (key, fallback = 0) => resumen[key] || fallback;
            const toUsd = (ves) => (tasaCambio > 0 ? ves / tasaCambio : 0);

            const ingresos = get('ingresos_totales_ves', get('ingresos_ves'));
            const gastos = get('gastos_totales_ves', get('gastos_ves'));
            const balance = get('saldo_remanente_ves');
            const fondoReserva = get('fondo_reserva_ves');
            const retirosVes = get('retiros_ves', gastos_mes.filter(g => g.categoria?.toUpperCase().includes('RETIRO')).reduce((s, g) => s + g.monto_ves, 0));

            App.ui.updateCard('total-income', ingresos, toUsd(ingresos));
            App.ui.updateCard('total-expense', gastos, toUsd(gastos));
            App.ui.updateCard('net-balance', balance, toUsd(balance));
            App.ui.updateCard('reserve-fund', fondoReserva, toUsd(fondoReserva));
            App.ui.updateCard('withdraw', retirosVes, toUsd(retirosVes));
        },

        updateCard(id, ves, usd) {
            const elVes = document.getElementById(`${id}-ves`);
            const elUsd = document.getElementById(`${id}-usd`);
            if (elVes) elVes.innerText = App.format.currency(ves, 'VES');
            if (elUsd) elUsd.innerText = App.format.currency(usd, 'USD');
        },

        populateBusSelectors() {
            const buses = [...new Set((App.state.data.ingresos_diarios || []).map(i => i.placa).filter(Boolean))].sort();
            ['bus-selector-informe', 'bus-selector-ingresos'].forEach(selectorId => {
                const selector = document.getElementById(selectorId);
                if (!selector) return;

                const currentValue = selector.value;
                selector.innerHTML = '<option value="">Seleccione un autobús...</option>';
                buses.forEach(bus => selector.innerHTML += `<option value="${bus}">${bus}</option>`);
                if (buses.includes(currentValue)) selector.value = currentValue;
            });
        }
    },

    // --- CHART RENDERING ---
    charts: {
        destroyAll() {
            Object.values(App.state.charts).forEach(chart => chart.destroy());
            App.state.charts = {};
        },

        updateAll() {
            App.charts.destroyAll();
            App.charts.createSummaryChart();
            App.charts.createExpenseChart();
        },

        createSummaryChart() {
            const ctx = document.getElementById('incomeChart').getContext('2d');
            const { resumen = {} } = App.state.data;
            const ing = resumen.ingresos_totales_ves || resumen.ingresos_ves || 0;
            const gas = resumen.gastos_totales_ves || resumen.gastos_ves || 0;
            const bal = resumen.saldo_remanente_ves || 0;

            App.state.charts.summary = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Ingresos (Mes)', 'Gastos (Mes)', 'Caja (Total)'],
                    datasets: [{
                        label: 'Monto (VES)',
                        data: [ing, gas, bal],
                        backgroundColor: [App.config.themeColors.success, App.config.themeColors.danger, App.config.themeColors.accent]
                    }]
                },
                options: App.charts.getDefaultOptions()
            });
        },

        createExpenseChart() {
            const ctx = document.getElementById('expenseChart').getContext('2d');
            const gastosMap = (App.state.data.gastos_mes || []).reduce((acc, g) => {
                acc[g.categoria] = (acc[g.categoria] || 0) + g.monto_ves;
                return acc;
            }, {});

            const labels = Object.keys(gastosMap).length ? Object.keys(gastosMap) : ['Sin Gastos'];
            const data = Object.keys(gastosMap).length ? Object.values(gastosMap) : [1];

            App.state.charts.expense = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: Object.values(App.config.themeColors),
                        borderColor: App.config.themeColors.bgCard
                    }]
                },
                options: App.charts.getDoughnutOptions()
            });
        },

        getDefaultOptions: () => ({
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: App.config.themeColors.textSecondary }, grid: { color: App.config.themeColors.borderColor } },
                x: { ticks: { color: App.config.themeColors.textSecondary }, grid: { display: false } }
            }
        }),

        getDoughnutOptions: () => ({
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: App.config.themeColors.textSecondary } }
            }
        })
    },

    // --- TABLE RENDERING ---
    tables: {
        render(tbody, data, rowHtml, noDataMessage) {
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-secondary);">${noDataMessage}</td></tr>`;
                return;
            }
            tbody.innerHTML = data.map(rowHtml).join('');
        },

        loadIngresos() {
            const tbody = document.querySelector('#income-table tbody');
            const selectedBus = document.getElementById('bus-selector-ingresos')?.value;
            if (!selectedBus) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">Seleccione un autobús para ver los ingresos</td></tr>';
                return;
            }

            const data = (App.state.data.ingresos_diarios || []).filter(row => row.placa === selectedBus);
            const tasaCambio = parseFloat(App.state.data.resumen?.tasa_cambio) || 1;
            let totals = { ves: 0, fondo: 0, utilidadVes: 0, utilidadUsd: 0 };

            const rowHtml = (row) => {
                const montoVes = row.total_ves || 0;
                const pctFondo = row.porcentaje_fondo ?? 15.0;
                const fondoVes = row.fondo_ves ?? (montoVes * (pctFondo / 100));
                const utilidadVes = montoVes - fondoVes;
                const utilidadUsd = tasaCambio > 0 ? utilidadVes / tasaCambio : 0;

                totals.ves += montoVes;
                totals.fondo += fondoVes;
                totals.utilidadVes += utilidadVes;
                totals.utilidadUsd += utilidadUsd;

                return `<tr>
                    <td>${row.fecha}</td>
                    <td>${App.format.currency(montoVes, 'VES')}</td>
                    <td>${App.format.currency(fondoVes, 'VES')} <span style="font-size: 11px; color: var(--text-secondary);">(${pctFondo}%)</span></td>
                    <td>${App.format.currency(utilidadVes, 'VES')}</td>
                    <td>${App.format.currency(utilidadUsd, 'USD')}</td>
                </tr>`;
            };

            App.tables.render(tbody, data, rowHtml, 'No hay ingresos registrados para este autobús.');
            
            if (data.length > 0) {
                tbody.innerHTML += `<tr style="background-color: rgba(255,255,255,0.05); font-weight: bold;">
                    <td style="text-align: right; color: var(--text-secondary);">TOTAL:</td>
                    <td style="color: var(--success);">${App.format.currency(totals.ves, 'VES')}</td>
                    <td style="color: var(--warning);">${App.format.currency(totals.fondo, 'VES')}</td>
                    <td style="color: var(--success);">${App.format.currency(totals.utilidadVes, 'VES')}</td>
                    <td style="color: var(--success);">${App.format.currency(totals.utilidadUsd, 'USD')}</td>
                </tr>`;
            }
        },

        loadInformeAutobus() {
            const selectedBus = document.getElementById('bus-selector-informe')?.value;
            if (!selectedBus) {
                // Reset UI if no bus is selected
                ['inf-dias', 'inf-ingresos-ves', 'inf-ingresos-usd', 'inf-gastos-ves', 'inf-gastos-usd', 'inf-utilidad-ves', 'inf-utilidad-usd', 'inf-rentabilidad', 'inf-promedio-ves', 'inf-promedio-usd', 'inf-promedio-dias']
                    .forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerText = id.includes('dias') ? '0' : '...';
                    });
                document.querySelector('#inf-gastos-table tbody').innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-secondary);">Seleccione un autobús</td></tr>';
                return;
            }
            
            const { ingresos_diarios = [], gastos_mes = [], resumen = {} } = App.state.data;
            const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;
            const toUsd = (ves) => tasaCambio > 0 ? ves / tasaCambio : 0;

            const filteredIngresos = ingresos_diarios.filter(i => i.placa === selectedBus);
            const filteredGastos = gastos_mes.filter(g => g.tipo_pago === 'contado' && g.placa === selectedBus);

            const diasTrabajados = new Set(filteredIngresos.map(i => i.fecha)).size;
            const ingresosVes = filteredIngresos.reduce((sum, i) => sum + (i.total_ves || 0), 0);
            const gastosVes = filteredGastos.reduce((sum, g) => sum + (g.monto_ves || 0), 0);
            const utilidadVes = ingresosVes - gastosVes;
            const rentabilidad = ingresosVes > 0 ? (utilidadVes / ingresosVes) * 100 : 0;
            const diasMes = Math.max(1, new Date(App.state.data.ultima_actualizacion?.split(' ')[0] || new Date()).getDate());
            const promedioVes = ingresosVes / diasMes;

            document.getElementById('inf-dias').innerText = diasTrabajados;
            document.getElementById('inf-ingresos-ves').innerText = App.format.currency(ingresosVes, 'VES');
            document.getElementById('inf-ingresos-usd').innerText = App.format.currency(toUsd(ingresosVes), 'USD');
            document.getElementById('inf-gastos-ves').innerText = App.format.currency(gastosVes, 'VES');
            document.getElementById('inf-gastos-usd').innerText = App.format.currency(toUsd(gastosVes), 'USD');
            document.getElementById('inf-utilidad-ves').innerText = App.format.currency(utilidadVes, 'VES');
            document.getElementById('inf-utilidad-usd').innerText = App.format.currency(toUsd(utilidadVes), 'USD');
            document.getElementById('inf-rentabilidad').innerText = `${rentabilidad > 0 ? '+' : ''}${rentabilidad.toFixed(1)}%`;
            document.getElementById('inf-promedio-ves').innerText = App.format.currency(promedioVes, 'VES');
            document.getElementById('inf-promedio-usd').innerText = App.format.currency(toUsd(promedioVes), 'USD');
            document.getElementById('inf-promedio-dias').innerText = `Calculado en base a ${diasMes} día(s)`;

            ['inf-utilidad-ves', 'inf-utilidad-usd'].forEach(id => document.getElementById(id).style.color = utilidadVes >= 0 ? 'var(--success)' : 'var(--danger)');
            document.getElementById('inf-rentabilidad').style.color = rentabilidad >= 0 ? 'var(--success)' : 'var(--danger)';

            const breakdownMap = filteredGastos.reduce((acc, g) => {
                acc[g.categoria] = (acc[g.categoria] || 0) + g.monto_ves;
                return acc;
            }, {});
            const breakdownArray = Object.entries(breakdownMap).sort((a, b) => b[1] - a[1]);
            const tbody = document.querySelector('#inf-gastos-table tbody');
            const rowHtml = ([cat, monto]) => `<tr>
                <td>${cat}</td>
                <td>${App.format.currency(monto, 'VES')}</td>
                <td>${gastosVes > 0 ? (monto / gastosVes * 100).toFixed(1) : '0.0'}%</td>
            </tr>`;
            App.tables.render(tbody, breakdownArray, rowHtml, 'Sin gastos para este autobús.');
        },

        loadGastos() {
            const data = App.state.data.gastos_mes || [];
            const tbody = document.querySelector('#expense-table tbody');
            const rowHtml = (row) => `<tr>
                <td>${row.fecha}</td>
                <td>${row.categoria}</td>
                <td>${row.descripcion}</td>
                <td class="${row.estado === 'pagado' ? 'status-paid' : 'status-pending'}">${row.estado.toUpperCase()}</td>
                <td>${App.format.currency(row.monto_ves, 'VES')}</td>
                <td>${App.format.currency(row.monto_usd, 'USD')}</td>
            </tr>`;
            App.tables.render(tbody, data, rowHtml, 'No hay gastos registrados en este período.');
        },

        loadFacturas() {
            const data = App.state.data.facturas_pendientes || [];
            const tbody = document.querySelector('#facturas-table tbody');
            const tasaCambio = parseFloat(App.state.data.resumen?.tasa_cambio) || 1;
            let totalPendiente = 0;

            const rowHtml = (row) => {
                totalPendiente += row.pendiente_usd || 0;
                const diffDays = (new Date() - new Date(row.fecha + 'T00:00:00')) / (1000 * 60 * 60 * 24);
                const dateStyle = diffDays > 30 ? 'color: var(--danger); font-weight: bold;' : '';
                return `<tr>
                    <td style="${dateStyle}">${row.fecha}</td>
                    <td>${row.autobus}</td>
                    <td>${row.descripcion}</td>
                    <td>${App.format.currency(row.monto_usd, 'USD')}</td>
                    <td>${App.format.currency(row.abonado_usd, 'USD')}</td>
                    <td style="color: var(--danger); font-weight: bold;">${App.format.currency(row.pendiente_usd, 'USD')}</td>
                </tr>`;
            };
            
            App.tables.render(tbody, data, rowHtml, 'No hay facturas pendientes por pagar.');
            document.getElementById('facturas-total-ves').innerText = App.format.currency(totalPendiente * tasaCambio, 'VES');
        },

        loadAlarmas() {
            const data = App.state.data.alarmas || [];
            const tbody = document.querySelector('#alarms-table tbody');
            const rowHtml = (row) => {
                const dias = row.dias_restantes;
                const estadoInfo = dias <= 0 ? { text: "⚠ VENCIDO", class: "badge-vencido" }
                               : dias <= 3 ? { text: "URGENTE", class: "badge-urgente" }
                               : dias <= 7 ? { text: "POR VENCER", class: "badge-por-vencer" }
                               : { text: "EN TIEMPO", class: "badge-en-tiempo" };
                return `<tr>
                    <td><span class="status-badge ${estadoInfo.class}">${estadoInfo.text}</span></td>
                    <td>${row.placa}</td>
                    <td>${row.tipo}</td>
                    <td>${row.ultimo || 'Nunca'}</td>
                    <td>${row.proximo || 'No programado'}</td>
                </tr>`;
            };
            App.tables.render(tbody, data, rowHtml, 'No hay alarmas pendientes.');
        }
    },

    // --- FORMATTERS ---
    format: {
        currency: (amount, currency) => new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
    },

    // --- PWA & MOBILE ---
    pwa: {
        deferredPrompt: null,
        init() {
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('service-worker.js')
                        .then(() => console.log('Service Worker registrado.'))
                        .catch(err => console.error('Error en Service Worker:', err));
                });
            }
            window.addEventListener('beforeinstallprompt', App.pwa.handleBeforeInstallPrompt);
            document.getElementById('btn-install')?.addEventListener('click', App.pwa.install);
            document.getElementById('btn-dismiss')?.addEventListener('click', App.pwa.dismiss);
        },
        handleBeforeInstallPrompt(e) {
            e.preventDefault();
            App.pwa.deferredPrompt = e;
            if (!localStorage.getItem('pwaDismissed')) {
                document.getElementById('pwa-banner')?.classList.add('show');
            }
        },
        async install() {
            if (App.pwa.deferredPrompt) {
                document.getElementById('pwa-banner')?.classList.remove('show');
                App.pwa.deferredPrompt.prompt();
                App.pwa.deferredPrompt = null;
            }
        },
        dismiss() {
            document.getElementById('pwa-banner')?.classList.remove('show');
            localStorage.setItem('pwaDismissed', 'true');
        }
    },
    mobile: {
        init() {
            document.addEventListener('click', (event) => {
                const sidebar = document.getElementById('sidebar');
                const toggle = document.querySelector('.menu-toggle');
                if (sidebar && toggle && !sidebar.contains(event.target) && !toggle.contains(event.target) && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                }
            });
        },
        toggleSidebar() {
            document.getElementById('sidebar')?.classList.toggle('active');
        }
    }
};

// --- GLOBAL ENTRY POINT ---
document.addEventListener('DOMContentLoaded', App.init);
