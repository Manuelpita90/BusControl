from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import sqlite3
import os
import sys
import socket
from datetime import datetime, timedelta
from database import Database

app = Flask(__name__, static_folder='web', static_url_path='')
CORS(app) # Permite que GitHub Pages consuma esta API

# Desactivar caché del navegador para asegurar que siempre se muestren datos actuales
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Inicializar conexión a BD
# Usamos la misma clase Database pero tendremos cuidado con los hilos
def get_db_connection():
    # Conexión directa para control más fino en Flask
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, 'control_autobuses.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return send_from_directory('web', 'index.html')

@app.route('/api/autobuses')
def get_autobuses():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, placa, modelo FROM autobuses WHERE estado = "activo"')
    autobuses = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(autobuses)

@app.route('/api/resumen')
def get_resumen():
    periodo = request.args.get('periodo', 'month')
    specific_month = request.args.get('month')
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Calcular fechas
    hoy = datetime.now()
    
    # Definir filtros estrictos usando sintaxis SQL
    if periodo == 'today':
        filtro_fecha = "fecha = ?"
        param = hoy.strftime('%Y-%m-%d')
    elif periodo == 'week':
        inicio_semana = hoy - timedelta(days=hoy.weekday())
        filtro_fecha = "fecha >= ?"
        param = inicio_semana.strftime('%Y-%m-%d')
    elif periodo == 'month':
        # Filtrado estricto: Solo registros donde el Mes y Año coincidan
        filtro_fecha = "strftime('%Y-%m', fecha) = ?"
        if specific_month:
            param = specific_month
        else:
            param = hoy.strftime('%Y-%m')
    elif periodo == 'year':
        filtro_fecha = "strftime('%Y', fecha) = ?"
        param = hoy.strftime('%Y')
    else:
        # Default a mes actual estricto
        filtro_fecha = "strftime('%Y-%m', fecha) = ?"
        if specific_month:
            param = specific_month
        else:
            param = hoy.strftime('%Y-%m')
        
    # Consultas de totales
    cursor.execute(f'SELECT SUM(monto_ves) as total, SUM(monto_usd) as total_usd FROM ingresos WHERE {filtro_fecha}', (param,))
    ingresos = cursor.fetchone()
    
    cursor.execute(f'SELECT SUM(monto_ves) as total, SUM(monto_usd) as total_usd FROM gastos WHERE {filtro_fecha} AND estado = "pagado"', (param,))
    gastos = cursor.fetchone()
    
    resumen = {
        'ingresos_ves': ingresos['total'] or 0,
        'ingresos_usd': ingresos['total_usd'] or 0,
        'gastos_ves': gastos['total'] or 0,
        'gastos_usd': gastos['total_usd'] or 0,
        'balance_ves': (ingresos['total'] or 0) - (gastos['total'] or 0),
        'balance_usd': (ingresos['total_usd'] or 0) - (gastos['total_usd'] or 0)
    }
    
    conn.close()
    return jsonify(resumen)

@app.route('/api/ingresos')
def get_ingresos():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Filtros
    limit = request.args.get('limit', 50)
    periodo = request.args.get('periodo')
    specific_month = request.args.get('month')
    
    query = '''
        SELECT i.fecha, a.placa, i.monto_ves, i.monto_usd, i.descripcion 
        FROM ingresos i
        JOIN autobuses a ON i.autobus_id = a.id
    '''
    params = []
    
    # Si se especifica periodo 'month', filtrar estrictamente
    if periodo == 'month':
        query += " WHERE strftime('%Y-%m', i.fecha) = ?"
        if specific_month:
            params.append(specific_month)
        else:
            params.append(datetime.now().strftime('%Y-%m'))
        
    query += ' ORDER BY i.fecha DESC LIMIT ?'
    params.append(limit)
    
    cursor.execute(query, tuple(params))
    data = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(data)

@app.route('/api/gastos')
def get_gastos():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    limit = request.args.get('limit', 50)
    periodo = request.args.get('periodo')
    specific_month = request.args.get('month')
    
    query = '''
        SELECT g.fecha, c.nombre as categoria, g.descripcion, g.monto_ves, g.monto_usd, g.estado
        FROM gastos g
        JOIN categorias_gastos c ON g.categoria_id = c.id
    '''
    params = []
    
    # Si se especifica periodo 'month', filtrar estrictamente
    if periodo == 'month':
        query += " WHERE strftime('%Y-%m', g.fecha) = ?"
        if specific_month:
            params.append(specific_month)
        else:
            params.append(datetime.now().strftime('%Y-%m'))
        
    query += ' ORDER BY g.fecha DESC LIMIT ?'
    params.append(limit)
    
    cursor.execute(query, tuple(params))
    data = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(data)

@app.route('/api/graficos/ingresos_diarios')
def get_grafico_ingresos():
    periodo = request.args.get('periodo', 'month')
    specific_month = request.args.get('month')
    conn = get_db_connection()
    cursor = conn.cursor()
    
    hoy = datetime.now()
    if periodo == 'month':
        # Filtrado estricto por mes
        if specific_month:
            param = specific_month
        else:
            param = hoy.strftime('%Y-%m')
        where_clause = "strftime('%Y-%m', fecha) = ?"
    else:
        param = (hoy - timedelta(days=30)).strftime('%Y-%m-%d')
        where_clause = "fecha >= ?"

    query = f'''
        SELECT fecha, SUM(monto_ves) as total 
        FROM ingresos 
        WHERE {where_clause}
        GROUP BY fecha 
        ORDER BY fecha
    '''
    cursor.execute(query, (param,))
    data = {'labels': [], 'values': []}
    for row in cursor.fetchall():
        data['labels'].append(row['fecha'])
        data['values'].append(row['total'])
        
    conn.close()
    return jsonify(data)

@app.route('/api/meses_disponibles')
def get_meses_disponibles():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Obtener meses únicos de ingresos y gastos
    query = '''
        SELECT DISTINCT strftime('%Y-%m', fecha) as mes 
        FROM (SELECT fecha FROM ingresos UNION SELECT fecha FROM gastos)
        WHERE mes IS NOT NULL
        ORDER BY mes DESC
    '''
    cursor.execute(query)
    meses = [row['mes'] for row in cursor.fetchall()]
    conn.close()
    return jsonify(meses)

@app.route('/api/status')
def get_status():
    """Ruta para verificar la fecha y hora actual del servidor"""
    return jsonify({
        'status': 'online',
        'server_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })

if __name__ == '__main__':
    # Detectar IP local automáticamente
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # No necesita ser alcanzable, solo para determinar la interfaz de salida
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()

    print("=============================================")
    print("      SERVIDOR WEB BUSCONTROL ACTIVO")
    print("=============================================")
    print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("---------------------------------------------")
    print(f"[PC]:      http://localhost:5000")
    print(f"[Celular]: http://{IP}:5000")
    print("---------------------------------------------")
    print("[Info]: Si no conecta en el celular, revisa el")
    print("        Firewall de Windows (Puerto 5000).")
    print("=============================================")
    
    # Usar puerto del entorno (para la nube) o 5000 por defecto
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
