import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html' 
})
export class App implements OnInit {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  
  vistaActual: string = 'ventas'; 
  productos: any[] = [];
  lotesDisponibles: any[] = [];
  
  carrito: any[] = [];
  loteSeleccionado: any = ''; 
  cantidad: number = 1;
  precioVentaManual: number = 0; 
  totalVenta: number = 0;
  
  metodoPago: string = 'EFECTIVO'; 
  nombreCliente: string = ''; 

  nuevoProducto = { nombre: '' };
  nuevoLote = { cantidad: 0, precio_compra: 0 }; 
  pagarConCaja: boolean = true; 

  transaccionesCaja: any[] = [];
  totalEnCaja: number = 0;
  deudasPendientes: any[] = []; 

  // === VARIABLES PARA GASTOS Y RETIROS ===
  mostrarFormularioSalida: boolean = false;
  nuevaSalida = {
    monto: null as number | null,
    descripcion: '',
    tipo: 'GASTO_OPERATIVO' // Por defecto
  };

  // === NUEVAS VARIABLES PARA FILTRO Y ORDEN DE DÍAS ===
  fechaFiltroCaja: string = ''; 
  cajaAgrupadaPorDias: any[] = [];

  ngOnInit() {
    this.cargarProductos();
    this.cargarLotes(); 
    this.cargarCaja(); 
    this.cargarDeudas(); 
  }

  cargarProductos() {
    this.http.get('http://https://api-sistemaventas.onrender.com/api/productos/').subscribe((data: any) => {
      this.productos = data;
      this.cdr.detectChanges();
    });
  }

  cargarLotes() {
    this.http.get('http://https://api-sistemaventas.onrender.com/api/lotes/').subscribe((data: any) => {
      this.lotesDisponibles = data.filter((lote: any) => lote.cantidad_disponible > 0);
      this.cdr.detectChanges();
    });
  }

  cargarCaja() {
    this.http.get('http://https://api-sistemaventas.onrender.com/api/caja/').subscribe((data: any) => {
      this.transaccionesCaja = data;
      this.totalEnCaja = this.transaccionesCaja.reduce((total, t) => {
        const monto = parseFloat(t.monto);
        return (t.tipo === 'VENTA' || t.tipo === 'INGRESO_EXTRA') ? total + monto : total - monto;
      }, 0);
      
      // 👇 AQUÍ LLAMAMOS A LA NUEVA FUNCIÓN PARA ORDENAR
      this.procesarFiltroCaja(); 
      this.cdr.detectChanges();
    });
  }

  // === NUEVA FUNCIÓN: AGRUPAR POR DÍA Y FILTRAR ===
  procesarFiltroCaja() {
    let datosAProcesar = this.transaccionesCaja;
    
    // Si hay una fecha seleccionada en el input, filtramos
    if (this.fechaFiltroCaja) {
      const [year, month, day] = this.fechaFiltroCaja.split('-');
      const fechaSeleccionada = new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();

      datosAProcesar = this.transaccionesCaja.filter((t: any) => {
        const fechaObj = new Date(t.fecha_hora || t.fecha || t.created_at || new Date());
        return fechaObj.toLocaleDateString() === fechaSeleccionada;
      });
    }

    // Agrupamos las transacciones por día
    const grupos: any = {};
    
    datosAProcesar.forEach((t: any) => {
      const fechaObj = new Date(t.fecha_hora || t.fecha || t.created_at || new Date());
      const fechaLocal = fechaObj.toLocaleDateString();
      const horaLocal = fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      t.horaFormat = horaLocal; // Guardamos la hora formateada para el HTML

      if (!grupos[fechaLocal]) {
        grupos[fechaLocal] = { fechaObj: fechaObj, fecha: fechaLocal, transacciones: [], subtotalDia: 0 };
      }
      
      grupos[fechaLocal].transacciones.push(t);
      
      const monto = parseFloat(t.monto);
      if (t.tipo === 'VENTA' || t.tipo === 'INGRESO_EXTRA') {
        grupos[fechaLocal].subtotalDia += monto;
      } else {
        grupos[fechaLocal].subtotalDia -= monto;
      }
    });

    // Convertimos a arreglo y ordenamos del más reciente al más antiguo
    this.cajaAgrupadaPorDias = Object.values(grupos);
    this.cajaAgrupadaPorDias.sort((a: any, b: any) => b.fechaObj.getTime() - a.fechaObj.getTime());
    
    this.cajaAgrupadaPorDias.forEach(dia => {
      dia.transacciones.sort((a: any, b: any) => b.id - a.id);
    });
  }

  cargarDeudas() {
    this.http.get('http://https://api-sistemaventas.onrender.com/api/cuentas-cobrar/').subscribe((data: any) => {
      this.deudasPendientes = data.filter((d: any) => d.estado === 'PENDIENTE');
      this.cdr.detectChanges();
    });
  }

  agregarAlCarrito() {
    if (!this.loteSeleccionado || this.cantidad <= 0 || this.precioVentaManual <= 0) {
      alert("Por favor selecciona un lote, pon una cantidad y un precio válido.");
      return;
    }

    const lote = this.lotesDisponibles.find(l => l.id == this.loteSeleccionado);
    if (lote) {
      if (this.cantidad > lote.cantidad_disponible) {
        alert(`¡No puedes vender ${this.cantidad}! Solo quedan ${lote.cantidad_disponible}.`);
        return;
      }
      this.carrito.push({
        lote_id: lote.id, 
        producto_id: lote.producto,
        nombre: lote.nombre_producto, 
        precio: this.precioVentaManual, 
        cantidad: this.cantidad,
        subtotal: this.precioVentaManual * this.cantidad
      });
      this.calcularTotal();
      this.loteSeleccionado = '';
      this.cantidad = 1;
      this.precioVentaManual = 0; 
    }
  }

  calcularTotal() {
    this.totalVenta = this.carrito.reduce((suma, item) => suma + item.subtotal, 0);
  }

  cobrarVenta() {
    if (this.carrito.length === 0) return alert('El ticket está vacío.');
    
    if (this.metodoPago === 'FIADO' && this.nombreCliente.trim() === '') {
      return alert('Debes escribir el nombre del cliente para poder fiarle.');
    }

    const datosVenta = {
      total_venta: this.totalVenta, 
      metodo_pago: this.metodoPago 
    };

    this.http.post('http://https://api-sistemaventas.onrender.com/api/ventas/', datosVenta).subscribe({
      next: (ventaCreada: any) => {
        const idVenta = ventaCreada.id;

        this.carrito.forEach(item => {
          const detalle = {
            venta: idVenta, 
            lote_origen: item.lote_id, 
            cantidad_vendida: item.cantidad, 
            precio_venta: item.precio 
          };
          this.http.post('http://https://api-sistemaventas.onrender.com/api/detalles-venta/', detalle).subscribe();
        });

        if (this.metodoPago === 'FIADO') {
          const datosDeuda = {
            nombre_cliente: this.nombreCliente,
            venta_asociada: idVenta,
            monto_deuda: this.totalVenta,
            monto_pagado_hasta_ahora: 0,
            estado: 'PENDIENTE'
          };
          this.http.post('http://https://api-sistemaventas.onrender.com/api/cuentas-cobrar/', datosDeuda).subscribe(() => {
            this.cargarDeudas(); 
          });
        }

        alert(`¡Venta procesada con éxito como ${this.metodoPago}!`);
        this.carrito = [];
        this.totalVenta = 0;
        this.nombreCliente = '';
        this.metodoPago = 'EFECTIVO'; 
        
        this.cargarLotes(); 
        this.cargarCaja(); 
        this.cdr.detectChanges();
      }
    });
  }

  guardarProducto() {
    const costoTotalCompra = (this.nuevoLote.cantidad * this.nuevoLote.precio_compra) || 0;

    if (this.pagarConCaja && this.totalEnCaja < costoTotalCompra) {
      alert(`⚠️ No hay suficiente dinero en la caja.\n\nIntentas pagar $${costoTotalCompra.toFixed(2)} pero solo tienes $${this.totalEnCaja.toFixed(2)}.\n\nDesmarca la casilla "Pagar con Caja" si vas a poner el dinero de tu bolsillo.`);
      return;
    }

    this.http.post('http://https://api-sistemaventas.onrender.com/api/productos/', this.nuevoProducto).subscribe({
      next: (productoCreado: any) => {
        const datosLote = {
          producto: productoCreado.id,
          cantidad_comprada: this.nuevoLote.cantidad,
          cantidad_disponible: this.nuevoLote.cantidad, 
          precio_compra: this.nuevoLote.precio_compra,
          precio_venta: 0 
        };
        this.http.post('http://https://api-sistemaventas.onrender.com/api/lotes/', datosLote).subscribe({
          next: () => {
            if (this.pagarConCaja && costoTotalCompra > 0) {
              const registroGasto = {
                tipo: 'GASTO_OPERATIVO',
                monto: costoTotalCompra,
                descripcion: `Compra Mercadería: ${this.nuevoLote.cantidad}x ${this.nuevoProducto.nombre}`
              };
              this.http.post('http://https://api-sistemaventas.onrender.com/api/caja/', registroGasto).subscribe(() => {
                this.cargarCaja();
                this.limpiarFormularioInventario(true);
              });
            } else {
              this.limpiarFormularioInventario(false);
            }
          }
        });
      }
    });
  }

  limpiarFormularioInventario(pagadoConCaja: boolean) {
    if (pagadoConCaja) {
      alert('¡Mercadería registrada y descontada de la caja exitosamente!');
    } else {
      alert('¡Mercadería registrada! (No se descontó dinero de la caja).');
    }
    this.cargarProductos();
    this.cargarLotes(); 
    this.nuevoProducto = { nombre: '' };
    this.nuevoLote = { cantidad: 0, precio_compra: 0 };
    this.pagarConCaja = true; 
  }

  registrarPagoDeuda(deuda: any) {
    const pagadoHastaAhora = parseFloat(deuda.monto_pagado_hasta_ahora || 0);
    const montoDeuda = parseFloat(deuda.monto_deuda);
    const saldoPendiente = montoDeuda - pagadoHastaAhora;

    const abonoStr = prompt(`El cliente ${deuda.nombre_cliente} debe $${saldoPendiente.toFixed(2)}.\n¿Cuánto dinero va a abonar?`, saldoPendiente.toString());
    if (abonoStr === null || abonoStr.trim() === '') return; 

    const abono = parseFloat(abonoStr);
    
    if (isNaN(abono) || abono <= 0 || abono > saldoPendiente) {
      alert('⚠️ Cantidad inválida. Ingresa un monto que no supere la deuda actual.');
      return;
    }

    const nuevoPagado = pagadoHastaAhora + abono;
    const nuevoEstado = nuevoPagado >= montoDeuda ? 'PAGADO' : 'PENDIENTE';

    this.http.patch(`http://https://api-sistemaventas.onrender.com/api/cuentas-cobrar/${deuda.id}/`, {
      monto_pagado_hasta_ahora: nuevoPagado,
      estado: nuevoEstado
    }).subscribe({
      next: () => {
        const registroCaja = {
          tipo: 'INGRESO_EXTRA',
          monto: abono,
          descripcion: `Abono de Fiado: ${deuda.nombre_cliente} (Ref: Venta #${deuda.venta_asociada})`
        };

        this.http.post('http://https://api-sistemaventas.onrender.com/api/caja/', registroCaja).subscribe(() => {
          if (nuevoEstado === 'PAGADO') {
            alert(`¡Excelente! ${deuda.nombre_cliente} ha liquidado toda su deuda.`);
          } else {
            alert(`Abono de $${abono} registrado. Aún debe $${(montoDeuda - nuevoPagado).toFixed(2)}.`);
          }
          this.cargarDeudas();
          this.cargarCaja();
        });
      }
    });
  }

  devolverProductos(deuda: any) {
    const confirmacion = confirm(`¿Estás seguro de que ${deuda.nombre_cliente} devolvió los productos?\nEsto cancelará la deuda y los productos regresarán a tu inventario.`);
    if (!confirmacion) return;

    this.http.get('http://https://api-sistemaventas.onrender.com/api/detalles-venta/').subscribe((detalles: any) => {
      const detallesDeEstaVenta = detalles.filter((d: any) => d.venta === deuda.venta_asociada);

      detallesDeEstaVenta.forEach((detalle: any) => {
        this.http.get(`http://https://api-sistemaventas.onrender.com/api/lotes/${detalle.lote_origen}/`).subscribe((lote: any) => {
          const stockRecuperado = lote.cantidad_disponible + detalle.cantidad_vendida;
          
          this.http.patch(`http://https://api-sistemaventas.onrender.com/api/lotes/${lote.id}/`, {
            cantidad_disponible: stockRecuperado
          }).subscribe();
        });
      });

      this.http.patch(`http://https://api-sistemaventas.onrender.com/api/cuentas-cobrar/${deuda.id}/`, {
        estado: 'PAGADO',
        monto_deuda: 0,
        monto_pagado_hasta_ahora: 0
      }).subscribe(() => {
        alert('✅ ¡Devolución exitosa! Los productos ya están de vuelta en la bodega y la deuda se canceló.');
        this.cargarDeudas();
        this.cargarLotes(); 
      });
    });
  }

  verReporteDiario() {
    const hoyStr = new Date().toLocaleDateString();

    this.http.get('http://https://api-sistemaventas.onrender.com/api/ventas/').subscribe((ventas: any) => {
      const ventasHoy = ventas.filter((v: any) => new Date(v.fecha_hora).toLocaleDateString() === hoyStr);
      const totalVendidoHoy = ventasHoy.reduce((sum: number, v: any) => sum + parseFloat(v.total_venta), 0);
      const idsVentasHoy = ventasHoy.map((v: any) => v.id);

      this.http.get('http://https://api-sistemaventas.onrender.com/api/detalles-venta/').subscribe((detalles: any) => {
        const detallesHoy = detalles.filter((d: any) => idsVentasHoy.includes(d.venta));

        this.http.get('http://https://api-sistemaventas.onrender.com/api/lotes/').subscribe((lotes: any) => {
          let resumenProductos: any = {};
          
          detallesHoy.forEach((d: any) => {
            const lote = lotes.find((l: any) => l.id === d.lote_origen);
            const nombreProd = lote ? lote.nombre_producto : 'Producto Desconocido';
            
            if (!resumenProductos[nombreProd]) {
              resumenProductos[nombreProd] = { cantidad: 0, total_dinero: 0 };
            }
            resumenProductos[nombreProd].cantidad += d.cantidad_vendida;
            resumenProductos[nombreProd].total_dinero += (parseFloat(d.precio_venta) * d.cantidad_vendida);
          });

          let reporte = `📊 REPORTE DE VENTAS DEL DÍA (${hoyStr})\n`;
          reporte += `========================================\n`;
          reporte += `💵 Ingresos por Ventas Hoy: $${totalVendidoHoy.toFixed(2)}\n\n`;
          reporte += `📦 PRODUCTOS MOVIDOS HOY:\n`;
          
          let hayProductos = false;
          for (let prod in resumenProductos) {
            hayProductos = true;
            reporte += `  • ${prod}: ${resumenProductos[prod].cantidad} unidades (Sumó $${resumenProductos[prod].total_dinero.toFixed(2)})\n`;
          }
          if (!hayProductos) reporte += `  (No has vendido nada el día de hoy)\n`;
          
          reporte += `========================================\n\n`;
          reporte += `💰 CAPITAL DISPONIBLE EN CAJA: $${this.totalEnCaja.toFixed(2)}\n`;
          reporte += `(Este dinero sigue acumulándose para futuras compras y operaciones).`;

          alert(reporte);
        });
      });
    });
  }

  // === NUEVA FUNCIÓN: REGISTRAR GASTO O RETIRO ===
  registrarSalidaDinero() {
    if (!this.nuevaSalida.monto || this.nuevaSalida.monto <= 0) {
      alert('⚠️ Por favor ingresa un monto válido a retirar.');
      return;
    }
    
    if (this.nuevaSalida.monto > this.totalEnCaja) {
      alert(`⚠️ No tienes suficiente dinero en la caja. Intentas sacar $${this.nuevaSalida.monto} pero solo hay $${this.totalEnCaja}.`);
      return;
    }

    if (this.nuevaSalida.descripcion.trim() === '') {
      alert('⚠️ Por favor escribe una descripción para saber en qué se fue el dinero.');
      return;
    }

    const registroSalida = {
      tipo: this.nuevaSalida.tipo, 
      monto: this.nuevaSalida.monto,
      descripcion: this.nuevaSalida.descripcion
    };

    this.http.post('http://https://api-sistemaventas.onrender.com/api/caja/', registroSalida).subscribe({
      next: () => {
        alert('✅ Salida de dinero registrada y descontada con éxito.');
        this.cargarCaja(); 
        
        // Limpiamos y ocultamos el formulario
        this.nuevaSalida = { monto: null, descripcion: '', tipo: 'GASTO_OPERATIVO' };
        this.mostrarFormularioSalida = false;
      },
      error: (err) => {
        console.error(err);
        alert('Hubo un error al registrar la salida de dinero.');
      }
    });
  }
}