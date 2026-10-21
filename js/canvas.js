export function setupSignatureCanvas(canvasId, clearBtnId) {
    const canvas = document.getElementById(canvasId);
    const clearButton = document.getElementById(clearBtnId);
    if (!canvas) return;

    const context = canvas.getContext('2d');
    let isDrawing = false;

    function getPosition(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width),
            y: (event.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener('pointerdown', event => {
        isDrawing = true;
        canvas.setPointerCapture(event.pointerId);
        const { x, y } = getPosition(event);
        context.beginPath();
        context.moveTo(x, y);
    });

    canvas.addEventListener('pointermove', event => {
        if (!isDrawing) return;
        const { x, y } = getPosition(event);
        canvas.dataset.hasInk = 'true';
        context.lineWidth = 4;
        context.lineCap = 'round';
        context.strokeStyle = '#111827';
        context.lineTo(x, y);
        context.stroke();
    });

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        context.beginPath();
        canvas.dispatchEvent(new CustomEvent('signaturechange'));
    }

    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            canvas.dataset.hasInk = 'false';
            canvas.dispatchEvent(new CustomEvent('signaturechange'));
        });
    }
}
