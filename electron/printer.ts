import { PosPrinter, PosPrintData, PosPrintOptions } from 'electron-pos-printer';
import { BrowserWindow } from 'electron';

export interface ReceiptData {
    businessName: string;
    address?: string;
    phone?: string;
    saleNumber: number;
    date: string;
    items: Array<{
        name: string;
        quantity: number;
        price: number;
        subtotal: number;
    }>;
    subtotal: number;
    discount: number;
    total: number;
    paymentMethod: string;
    amountReceived?: number;
    change?: number;
    notes?: string;
    footer?: string;
}

export async function printReceipt(window: BrowserWindow, printerName: string, data: ReceiptData) {
    const printData: PosPrintData[] = [
        {
            type: 'text',
            value: data.businessName,
            style: { fontWeight: '700', textAlign: 'center', fontSize: '18px' }
        }
    ];

    if (data.address) {
        printData.push({
            type: 'text',
            value: data.address,
            style: { textAlign: 'center', fontSize: '12px' }
        });
    }

    if (data.phone) {
        printData.push({
            type: 'text',
            value: `Tel: ${data.phone}`,
            style: { textAlign: 'center', fontSize: '12px' }
        });
    }

    printData.push({
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center' }
    });

    printData.push({
        type: 'text',
        value: `Ticket #: ${data.saleNumber}`,
        style: { fontWeight: '700', fontSize: '14px' }
    });

    printData.push({
        type: 'text',
        value: `Fecha: ${new Date(data.date).toLocaleString()}`,
        style: { fontSize: '12px' }
    });

    printData.push({
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center' }
    });

    // Header for table
    printData.push({
        type: 'text',
        value: 'Cant  Producto         Total',
        style: { fontWeight: '700', fontSize: '12px' }
    });

    // Items
    for (const item of data.items) {
        const name = item.name.substring(0, 16).padEnd(16, ' ');
        const qty = item.quantity.toString().padStart(4, ' ');
        const total = item.subtotal.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' }).padStart(10, ' ');

        printData.push({
            type: 'text',
            value: `${qty}  ${name} ${total}`,
            style: { fontSize: '12px', fontFamily: 'monospace' }
        });
    }

    printData.push({
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center' }
    });

    printData.push({
        type: 'text',
        value: `Subtotal: ${data.subtotal.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}`,
        style: { textAlign: 'right', fontSize: '12px' }
    });

    if (data.discount > 0) {
        printData.push({
            type: 'text',
            value: `Descuento: ${data.discount.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}`,
            style: { textAlign: 'right', fontSize: '12px' }
        });
    }

    printData.push({
        type: 'text',
        value: `TOTAL: ${data.total.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}`,
        style: { textAlign: 'right', fontWeight: '700', fontSize: '16px' }
    });

    printData.push({
        type: 'text',
        value: `Pago: ${data.paymentMethod}`,
        style: { fontSize: '12px', marginTop: '5px' }
    });

    if (data.amountReceived) {
        printData.push({
            type: 'text',
            value: `Recibido: ${data.amountReceived.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}`,
            style: { fontSize: '12px' }
        });
        printData.push({
            type: 'text',
            value: `Vuelto: ${data.change?.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}`,
            style: { fontSize: '12px' }
        });
    }

    if (data.notes) {
        printData.push({
            type: 'text',
            value: `Notas: ${data.notes}`,
            style: { fontSize: '10px', marginTop: '5px', fontStyle: 'italic' }
        });
    }

    printData.push({
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center', marginTop: '10px' }
    });

    if (data.footer) {
        printData.push({
            type: 'text',
            value: data.footer,
            style: { textAlign: 'center', fontSize: '12px' }
        });
    }

    const options: PosPrintOptions = {
        printerName,
        silent: true,
        preview: false,
        margin: '0 0 0 0',
        copies: 1,
        width: '200px', // standard paper width
        boolean: true, // Required by type definition for some reason
    };

    try {
        await PosPrinter.print(printData, options);
        return { success: true };
    } catch (error) {
        console.error('Print Error:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * Open cash drawer via ESC/POS command
 */
export async function openCashDrawer(printerName: string) {
    // Standard ESC/POS command for opening drawer: ESC p m t1 t2
    // m = 0 (pin 2) or 1 (pin 5)
    // t1, t2 = pulse time
    const openDrawerData: PosPrintData[] = [
        {
            type: 'text',
            value: '\x1Bp\x00\x19\xFA', // ESC p 0 25 250
            style: {}
        }
    ];

    const options: PosPrintOptions = {
        printerName,
        silent: true,
        preview: false,
        copies: 1,
        width: '10px', // Minimum width
        boolean: true,
    };

    try {
        await PosPrinter.print(openDrawerData, options);
        return { success: true };
    } catch (error) {
        console.error('Drawer Error:', error);
        return { success: false, error: String(error) };
    }
}
