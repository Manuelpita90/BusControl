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
        'gastos': 'Reporte de Gastos',
        'alarmas': 'Alarmas de Mantenimiento'
    };
    document.getElementById('page-title').innerText = titles[sectionId];

    // Refresh specific data
    if (sectionId === 'ingresos') loadIngresosTable();
    if (sectionId === 'gastos') loadGastosTable();
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
        const res = await fetch(`${FIREBASE_URL}/dashboard.json`);
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

    const ingresosUsd = resumen.ingresos_totales_usd || resumen.ingresos_usd || 0;
    const gastosUsd = resumen.gastos_totales_usd || resumen.gastos_usd || 0;
    const balanceUsd = resumen.saldo_remanente_usd || 0;

    document.getElementById('total-income-ves').innerText = formatCurrency(ingresos, 'VES');
    document.getElementById('total-expense-ves').innerText = formatCurrency(gastos, 'VES');
    document.getElementById('net-balance-ves').innerText = formatCurrency(balance, 'VES');
    document.getElementById('reserve-fund-ves').innerText = formatCurrency(fondoReserva, 'VES');

    document.getElementById('total-income-usd').innerText = formatCurrency(ingresosUsd, 'USD');
    document.getElementById('total-expense-usd').innerText = formatCurrency(gastosUsd, 'USD');
    document.getElementById('net-balance-usd').innerText = formatCurrency(balanceUsd, 'USD');

    updateCharts(firebaseData);
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

// Data Tables
async function loadIngresosTable() {
    const data = firebaseData.ingresos_diarios || [];
    const tbody = document.querySelector('#income-table tbody');
    tbody.innerHTML = '';

    data.forEach(row => {
        tbody.innerHTML += `
            <tr>
                <td>${row.fecha}</td>
                <td>${formatCurrency(row.total_ves, 'VES')}</td>
                <td>${formatCurrency(row.total_usd, 'USD')}</td>
            </tr>
        `;
    });
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

function loadAlarmasTable() {
    const data = firebaseData.alarmas || [];
    const tbody = document.querySelector('#alarms-table tbody');
    tbody.innerHTML = '';

    data.forEach(row => {
        const alerta = row.dias_restantes <= 0 ? 'status-pending' : 'status-paid';
        tbody.innerHTML += `
            <tr>
                <td>${row.placa}</td>
                <td>${row.tipo}</td>
                <td>${row.proximo}</td>
                <td class="${alerta}">${row.dias_restantes <= 0 ? '¡VENCIDO!' : `Faltan ${row.dias_restantes} días`}</td>
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
