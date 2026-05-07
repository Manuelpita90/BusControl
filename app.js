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

    const resumen = firebaseData.resumen || { ingresos_totales_ves: 0, gastos_totales_ves: 0, utilidad_neta_ves: 0 };

    document.getElementById('total-income-ves').innerText = formatCurrency(resumen.ingresos_ves, 'VES');
    document.getElementById('total-expense-ves').innerText = formatCurrency(resumen.gastos_ves, 'VES');
    document.getElementById('net-balance-ves').innerText = formatCurrency(resumen.utilidad_neta_ves, 'VES');

    updateCharts(firebaseData);
}

function updateCharts(data) {
    const ctxIncome = document.getElementById('incomeChart').getContext('2d');
    const ctxExpense = document.getElementById('expenseChart').getContext('2d');

    // Destroy existing if needed
    if (charts.income) charts.income.destroy();
    if (charts.expense) charts.expense.destroy();

    const resumen = data.resumen || {};
    charts.income = new Chart(ctxIncome, {
        type: 'bar',
        data: {
            labels: ['Ingresos', 'Gastos', 'Balance'],
            datasets: [{
                label: 'Monto (VES)',
                data: [resumen.ingresos_totales_ves, resumen.gastos_totales_ves, resumen.utilidad_neta_ves],
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
    // In a real scenario we'd query /api/gastos/distribucion
    charts.expense = new Chart(ctxExpense, {
        type: 'doughnut',
        data: {
            labels: ['Gastos Operativos', 'Mantenimiento', 'Otros'], // Mock categories
            datasets: [{
                data: [data.gastos_ves * 0.6, data.gastos_ves * 0.3, data.gastos_ves * 0.1], // Mock distribution
                backgroundColor: ['#e74c3c', '#f1c40f', '#95a5a6']
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
                <td>${formatCurrency(row.monto_ves, 'VES')}</td>
                <td>${formatCurrency(row.monto_usd, 'USD')}</td>
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

async function loadAutobuses() {
    const buses = await api.getAutobuses();
    const container = document.getElementById('bus-list');
    container.innerHTML = '';

    buses.forEach(bus => {
        container.innerHTML += `
            <div class="card">
                <div class="card-icon">🚌</div>
                <div class="card-info">
                    <h3>${bus.placa}</h3>
                    <p>${bus.modelo}</p>
                    <p class="subtitle">Activo</p>
                </div>
            </div>
        `;
    });
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si se abrió como archivo local
    if (window.location.protocol === 'file:') {
        const msg = "⚠️ ERROR: Abriste el archivo incorrecto ⚠️\n\nNo abras index.html directamente.\nDebes ejecutar 'iniciar_web.bat' y usar la ventana que se abre (localhost:5000).";
        alert(msg);
        document.body.innerHTML = `<div style="color:white;text-align:center;padding:50px;"><h1>${msg.replace(/\n/g, '<br>')}</h1></div>`;
        return;
    }

    updateDashboard().catch(err => {
        console.error("Error fatal en dashboard:", err);
        alert("No se pudo conectar con el servidor. Verifica que la ventana negra de BusControl esté abierta.");
    });
});
