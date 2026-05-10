// ⚠️ ATENCIÓN: Reemplaza esto por tu misma URL de Firebase
const FIREBASE_URL = "https://buscontrol-a94e7-default-rtdb.firebaseio.com";

let charts = {};
let firebaseData = {}; // Cache local de la data

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    document.querySelector(`li[onclick="showSection('${sectionId}')"]`).classList.add('active');

    const titles = {
        'dashboard': 'Resumen General',
        'ingresos': 'Reporte de Ingresos',
        'informe': 'Informe por Autobús',
        'gastos': 'Reporte de Gastos',
        'facturas': 'Facturas por Pagar',
        'alarmas': 'Alarmas de Mantenimiento'
    };
    document.getElementById('page-title').innerText = titles[sectionId];

    // Refresh specific data
    if (sectionId === 'ingresos') loadIngresosTable();
    if (sectionId === 'informe') loadInformeAutobus();
    if (sectionId === 'gastos') loadGastosTable();
    if (sectionId === 'facturas') loadFacturasTable();
    if (sectionId === 'alarmas') loadAlarmasTable();
}

// Formatting
const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount);
};

// Dashboard Logic
async function updateDashboard() {
    try {
        const res = await fetch(`${FIREBASE_URL}/dashboard.json`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        if (!res.ok) throw new Error("Error en Firebase");
        firebaseData = await res.json() || {};
    } catch (e) {
        console.error(e);
        alert("Error al cargar datos desde Firebase.");
        return;
    }

    const resumen = firebaseData.resumen || {};

    // Usar || 0 evita que el valor sea 'undefined' y cause el error NaN
    const ingresos = resumen.ingresos_totales_ves || resumen.ingresos_ves || 0;
    const gastos = resumen.gastos_totales_ves || resumen.gastos_ves || 0;
    const balance = resumen.saldo_remanente_ves || 0;
    const fondoReserva = resumen.fondo_reserva_ves || 0;
    const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;

    // Convertir a USD utilizando la tasa de cambio actual para coincidir con la app de escritorio
    const ingresosUsd = tasaCambio > 0 ? ingresos / tasaCambio : 0;
    const gastosUsd = tasaCambio > 0 ? gastos / tasaCambio : 0;
    const balanceUsd = tasaCambio > 0 ? balance / tasaCambio : 0;
    const fondoReservaUsd = tasaCambio > 0 ? fondoReserva / tasaCambio : 0;

    document.getElementById('total-income-ves').innerText = formatCurrency(ingresos, 'VES');
    document.getElementById('total-expense-ves').innerText = formatCurrency(gastos, 'VES');
    document.getElementById('net-balance-ves').innerText = formatCurrency(balance, 'VES');
    document.getElementById('reserve-fund-ves').innerText = formatCurrency(fondoReserva, 'VES');

    document.getElementById('total-income-usd').innerText = formatCurrency(ingresosUsd, 'USD');
    document.getElementById('total-expense-usd').innerText = formatCurrency(gastosUsd, 'USD');
    document.getElementById('net-balance-usd').innerText = formatCurrency(balanceUsd, 'USD');
    if (document.getElementById('reserve-fund-usd')) document.getElementById('reserve-fund-usd').innerText = formatCurrency(fondoReservaUsd, 'USD');

    const ultimaActualizacion = firebaseData.ultima_actualizacion || "Desconocida";
    document.getElementById('last-sync').innerText = `☁️ Última sincronización: ${ultimaActualizacion} | Tasa: Bs. ${tasaCambio}`;

    updateCharts(firebaseData);
    populateBusSelector();
    if (document.getElementById('ingresos').classList.contains('active')) loadIngresosTable();
    if (document.getElementById('informe').classList.contains('active')) loadInformeAutobus();
    if (document.getElementById('facturas').classList.contains('active')) loadFacturasTable();
}

function updateCharts(data) {
    const ctxIncome = document.getElementById('incomeChart').getContext('2d');
    const ctxExpense = document.getElementById('expenseChart').getContext('2d');

    // Destroy existing if needed
    if (charts.income) charts.income.destroy();
    if (charts.expense) charts.expense.destroy();

    const resumen = data.resumen || {};
    const ing = resumen.ingresos_totales_ves || resumen.ingresos_ves || 0;
    const gas = resumen.gastos_totales_ves || resumen.gastos_ves || 0;
    const bal = resumen.saldo_remanente_ves || 0;

    charts.income = new Chart(ctxIncome, {
        type: 'bar',
        data: {
            labels: ['Ingresos (Mes)', 'Gastos (Mes)', 'Caja (Total)'],
            datasets: [{
                label: 'Monto (VES)',
                data: [ing, gas, bal],
                backgroundColor: ['#2ecc71', '#e74c3c', '#3498db']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    // Expense Distribution (Pie)
    let gastosMap = {};
    (data.gastos_mes || []).forEach(g => {
        gastosMap[g.categoria] = (gastosMap[g.categoria] || 0) + g.monto_ves;
    });

    const categorias = Object.keys(gastosMap);
    const montos = Object.values(gastosMap);

    charts.expense = new Chart(ctxExpense, {
        type: 'doughnut',
        data: {
            labels: categorias.length ? categorias : ['Sin Gastos'],
            datasets: [{
                data: montos.length ? montos : [1],
                backgroundColor: ['#e74c3c', '#f1c40f', '#95a5a6', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#34495e']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function populateBusSelector() {
    const data = firebaseData.ingresos_diarios || [];
    const selector = document.getElementById('bus-selector-informe');

    // Obtener autobuses únicos (filtrar vacíos por si acaso)
    const buses = [...new Set(data.map(item => item.placa).filter(Boolean))].sort();

    if (selector) {
        const currentValue = selector.value;
        selector.innerHTML = '<option value="">Seleccione un autobús...</option>';

        buses.forEach(bus => {
            const option = document.createElement('option');
            option.value = bus;
            option.textContent = bus;
            selector.appendChild(option);
        });
        if (buses.includes(currentValue)) {
            selector.value = currentValue;
        }
    }

    const selectorIngresos = document.getElementById('bus-selector-ingresos');
    if (selectorIngresos) {
        const currentValueIng = selectorIngresos.value;
        selectorIngresos.innerHTML = '<option value="">Seleccione un autobús...</option>';

        buses.forEach(bus => {
            const option = document.createElement('option');
            option.value = bus;
            option.textContent = bus;
            selectorIngresos.appendChild(option);
        });
        if (buses.includes(currentValueIng)) {
            selectorIngresos.value = currentValueIng;
        }
    }
}

// Informe Autobus Logic
function loadInformeAutobus() {
    const ingresosData = firebaseData.ingresos_diarios || [];
    const gastosData = firebaseData.gastos_mes || [];

    const selector = document.getElementById('bus-selector-informe');
    const selectedBus = selector ? selector.value : '';

    if (!selectedBus) {
        // Si no hay autobús seleccionado, vaciar la información
        document.getElementById('inf-dias').innerText = '0';
        document.getElementById('inf-ingresos-ves').innerText = 'Bs. 0.00';
        document.getElementById('inf-ingresos-usd').innerText = '$ 0.00';
        document.getElementById('inf-gastos-ves').innerText = 'Bs. 0.00';
        document.getElementById('inf-gastos-usd').innerText = '$ 0.00';
        document.getElementById('inf-utilidad-ves').innerText = 'Bs. 0.00';
        document.getElementById('inf-utilidad-ves').style.color = '';
        document.getElementById('inf-utilidad-usd').innerText = '$ 0.00';
        document.getElementById('inf-utilidad-usd').style.color = '';
        document.getElementById('inf-rentabilidad').innerText = '0.0%';
        document.getElementById('inf-rentabilidad').style.color = '';
        document.getElementById('inf-promedio-ves').innerText = 'Bs. 0.00';
        document.getElementById('inf-promedio-usd').innerText = '$ 0.00';
        if (document.getElementById('inf-promedio-dias')) document.getElementById('inf-promedio-dias').innerText = '';
        document.querySelector('#inf-gastos-table tbody').innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-secondary);">Seleccione un autobús para ver el desglose</td></tr>';
        return;
    }

    const filteredIngresos = ingresosData.filter(row => row.placa === selectedBus);
    const filteredGastos = gastosData.filter(g => g.tipo_pago === 'contado' && g.placa === selectedBus);

    // 1. Días Trabajados (Contar fechas únicas)
    const uniqueDates = new Set(filteredIngresos.map(i => i.fecha));
    const diasTrabajados = uniqueDates.size;
    document.getElementById('inf-dias').innerText = diasTrabajados;

    // 2. Ingresos y Gastos
    const ingresosVes = filteredIngresos.reduce((sum, i) => sum + (i.total_ves || 0), 0);
    const gastosVes = filteredGastos.reduce((sum, i) => sum + (i.monto_ves || 0), 0);

    const resumen = firebaseData.resumen || {};
    const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;

    const ingresosUsd = tasaCambio > 0 ? ingresosVes / tasaCambio : 0;
    const gastosUsd = tasaCambio > 0 ? gastosVes / tasaCambio : 0;

    // 3. Utilidad y Rentabilidad
    const utilidadVes = ingresosVes - gastosVes;
    const utilidadUsd = ingresosUsd - gastosUsd;
    const rentabilidad = ingresosVes > 0 ? (utilidadVes / ingresosVes) * 100 : 0;

    // 4. Promedio Diario (Usamos los días que lleva el mes actual)
    const dateStr = firebaseData.ultima_actualizacion;
    let diasMes = 1;
    if (dateStr) {
        // Extraer el día de "YYYY-MM-DD" para evitar problemas de zona horaria
        const parts = dateStr.split(' ')[0].split('-');
        if (parts.length === 3) {
            diasMes = Math.max(1, parseInt(parts[2], 10));
        }
    } else {
        diasMes = Math.max(1, new Date().getDate());
    }
    const promedioVes = ingresosVes / diasMes;
    const promedioUsd = ingresosUsd / diasMes;

    // Update UI Elements
    document.getElementById('inf-ingresos-ves').innerText = formatCurrency(ingresosVes, 'VES');
    document.getElementById('inf-ingresos-usd').innerText = formatCurrency(ingresosUsd, 'USD');
    document.getElementById('inf-gastos-ves').innerText = formatCurrency(gastosVes, 'VES');
    document.getElementById('inf-gastos-usd').innerText = formatCurrency(gastosUsd, 'USD');

    const cUtil = utilidadVes >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('inf-utilidad-ves').innerText = formatCurrency(utilidadVes, 'VES');
    document.getElementById('inf-utilidad-ves').style.color = cUtil;
    document.getElementById('inf-utilidad-usd').innerText = formatCurrency(utilidadUsd, 'USD');
    document.getElementById('inf-utilidad-usd').style.color = cUtil;

    const cRent = rentabilidad >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('inf-rentabilidad').innerText = `${rentabilidad > 0 ? '+' : ''}${rentabilidad.toFixed(1)}%`;
    document.getElementById('inf-rentabilidad').style.color = cRent;

    document.getElementById('inf-promedio-ves').innerText = formatCurrency(promedioVes, 'VES');
    document.getElementById('inf-promedio-usd').innerText = formatCurrency(promedioUsd, 'USD');

    if (document.getElementById('inf-promedio-dias')) {
        document.getElementById('inf-promedio-dias').innerText = `Calculado en base a ${diasMes} día(s)`;
    }

    // 5. Desglose de Gastos
    const breakdownMap = {};
    filteredGastos.forEach(g => {
        breakdownMap[g.categoria] = (breakdownMap[g.categoria] || 0) + g.monto_ves;
    });

    const breakdownArray = Object.entries(breakdownMap).sort((a, b) => b[1] - a[1]);
    const tbody = document.querySelector('#inf-gastos-table tbody');
    tbody.innerHTML = '';

    breakdownArray.forEach(([cat, monto]) => {
        const pct = gastosVes > 0 ? (monto / gastosVes) * 100 : 0;
        tbody.innerHTML += `
            <tr>
                <td>${cat}</td>
                <td>${formatCurrency(monto, 'VES')}</td>
                <td>${pct.toFixed(1)}%</td>
            </tr>
        `;
    });
}

function loadIngresosTable() {
    const data = firebaseData.ingresos_diarios || [];
    const tbody = document.querySelector('#income-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const selectedBus = document.getElementById('bus-selector-ingresos') ? document.getElementById('bus-selector-ingresos').value : '';

    if (!selectedBus) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">Seleccione un autobús para ver los ingresos</td></tr>';
        return;
    }

    const filteredData = data.filter(row => row.placa === selectedBus);
    let totalVes = 0;
    let totalFondo = 0;
    let totalUtilidadVes = 0;
    let totalUtilidadUsd = 0;

    const resumen = firebaseData.resumen || {};
    const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;

    filteredData.forEach(row => {
        const montoVes = row.total_ves || 0;
        const montoUsd = tasaCambio > 0 ? montoVes / tasaCambio : 0;
        const pctFondo = row.porcentaje_fondo !== undefined ? row.porcentaje_fondo : 15.0;
        const fondoVes = row.fondo_ves !== undefined ? row.fondo_ves : (montoVes * (pctFondo / 100));
        const fondoUsd = tasaCambio > 0 ? fondoVes / tasaCambio : 0;

        const utilidadVes = montoVes - fondoVes;
        const utilidadUsd = tasaCambio > 0 ? utilidadVes / tasaCambio : 0;

        totalVes += montoVes;
        totalFondo += fondoVes;
        totalUtilidadVes += utilidadVes;
        totalUtilidadUsd += utilidadUsd;

        tbody.innerHTML += `
            <tr>
                <td>${row.fecha}</td>
                <td>${formatCurrency(montoVes, 'VES')}</td>
                <td>${formatCurrency(fondoVes, 'VES')} <span style="font-size: 11px; color: var(--text-secondary);">(${pctFondo}%)</span></td>
                <td>${formatCurrency(utilidadVes, 'VES')}</td>
                <td>${formatCurrency(utilidadUsd, 'USD')}</td>
            </tr>
        `;
    });

    if (filteredData.length > 0) {
        tbody.innerHTML += `
            <tr style="background-color: rgba(255,255,255,0.05); font-weight: bold;">
                <td style="text-align: right; color: var(--text-secondary);">TOTAL:</td>
                <td style="color: #2ecc71;">${formatCurrency(totalVes, 'VES')}</td>
                <td style="color: #f1c40f;">${formatCurrency(totalFondo, 'VES')}</td>
                <td style="color: #2ecc71;">${formatCurrency(totalUtilidadVes, 'VES')}</td>
                <td style="color: #2ecc71;">${formatCurrency(totalUtilidadUsd, 'USD')}</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No hay ingresos registrados</td></tr>';
    }
}

async function loadGastosTable() {
    const data = firebaseData.gastos_mes || [];
    const tbody = document.querySelector('#expense-table tbody');
    tbody.innerHTML = '';

    data.forEach(row => {
        const estadoClass = row.estado === 'pagado' ? 'status-paid' : 'status-pending';
        tbody.innerHTML += `
            <tr>
                <td>${row.fecha}</td>
                <td>${row.categoria}</td>
                <td>${row.descripcion}</td>
                <td class="${estadoClass}">${row.estado.toUpperCase()}</td>
                <td>${formatCurrency(row.monto_ves, 'VES')}</td>
                <td>${formatCurrency(row.monto_usd, 'USD')}</td>
            </tr>
        `;
    });
}

function loadFacturasTable() {
    const data = firebaseData.facturas_pendientes || [];
    const tbody = document.querySelector('#facturas-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No hay facturas pendientes por pagar</td></tr>';
        if (document.getElementById('facturas-total-ves')) document.getElementById('facturas-total-ves').innerText = 'Bs. 0.00';
        return;
    }

    let totalMonto = 0;
    let totalAbonado = 0;
    let totalPendiente = 0;

    const today = new Date();

    const resumen = firebaseData.resumen || {};
    const tasaCambio = parseFloat(resumen.tasa_cambio) || 1;

    data.forEach(row => {
        totalMonto += row.monto_usd || 0;
        totalAbonado += row.abonado_usd || 0;
        totalPendiente += row.pendiente_usd || 0;

        // Calcular días transcurridos
        const invoiceDate = new Date(row.fecha + 'T00:00:00');
        const diffDays = (today - invoiceDate) / (1000 * 60 * 60 * 24);
        const dateStyle = diffDays > 30 ? 'color: var(--danger); font-weight: bold;' : '';

        tbody.innerHTML += `
            <tr>
                <td style="${dateStyle}">${row.fecha}</td>
                <td>${row.autobus}</td>
                <td>${row.descripcion}</td>
                <td>${formatCurrency(row.monto_usd, 'USD')}</td>
                <td>${formatCurrency(row.abonado_usd, 'USD')}</td>
                <td style="color: #f38ba8; font-weight: bold;">${formatCurrency(row.pendiente_usd, 'USD')}</td>
            </tr>
        `;
    });

    tbody.innerHTML += `
        <tr style="background-color: rgba(255,255,255,0.05); font-weight: bold;">
            <td colspan="3" style="text-align: right; color: var(--text-secondary);">TOTAL:</td>
            <td style="color: #2ecc71;">${formatCurrency(totalMonto, 'USD')}</td>
            <td style="color: #2ecc71;">${formatCurrency(totalAbonado, 'USD')}</td>
            <td style="color: #f38ba8;">${formatCurrency(totalPendiente, 'USD')}</td>
        </tr>
    `;

    if (document.getElementById('facturas-total-ves')) {
        document.getElementById('facturas-total-ves').innerText = formatCurrency(totalPendiente * tasaCambio, 'VES');
    }
}

function loadAlarmasTable() {
    const data = firebaseData.alarmas || [];
    const tbody = document.querySelector('#alarms-table tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No hay alarmas pendientes</td></tr>';
        return;
    }

    data.forEach(row => {
        let estado = "";
        let badgeClass = "";
        const dias = row.dias_restantes;

        if (dias <= 0) {
            estado = "⚠ VENCIDO";
            badgeClass = "badge-vencido";
        } else if (dias <= 3) {
            estado = "URGENTE";
            badgeClass = "badge-urgente";
        } else if (dias <= 7) {
            estado = "POR VENCER";
            badgeClass = "badge-por-vencer";
        } else {
            estado = "EN TIEMPO";
            badgeClass = "badge-en-tiempo";
        }

        tbody.innerHTML += `
            <tr>
                <td><span class="status-badge ${badgeClass}">${estado}</span></td>
                <td>${row.placa}</td>
                <td>${row.tipo}</td>
                <td>${row.ultimo || 'Nunca'}</td>
                <td>${row.proximo || 'No programado'}</td>
            </tr>
        `;
    });
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    updateDashboard().catch(err => {
        console.error("Error fatal en dashboard:", err);
        alert("No se pudo conectar con el servidor. Verifica que la ventana negra de BusControl esté abierta.");
    });
});

// PWA Install Logic
let deferredPrompt;
const pwaBanner = document.getElementById('pwa-banner');
const btnInstall = document.getElementById('btn-install');
const btnDismiss = document.getElementById('btn-dismiss');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que el mini-info-bar de Chrome aparezca en smartphones
    e.preventDefault();
    deferredPrompt = e;

    // Mostrar nuestro banner solo si el usuario no lo ha descartado antes
    if (!localStorage.getItem('pwaDismissed')) {
        pwaBanner.classList.add('show');
    }
});

btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
        pwaBanner.classList.remove('show');
        deferredPrompt.prompt();
        deferredPrompt = null;
    }
});

btnDismiss.addEventListener('click', () => {
    pwaBanner.classList.remove('show');
    localStorage.setItem('pwaDismissed', 'true');
});
