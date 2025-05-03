
class ChartManager {
    constructor(chartData) {
        this.currentTicker = 'AAPL';
        this.selectedInterval = '1m';
        this.xspan = 60;
        this.chart = null;
        this.candleseries = null;
        this.klines = [];

        this.currentTool = 'crosshair';

        this.lines = [];
        this.lineSeries = null;
        this.startPoint = null;
        this.isUpdatingLine = null;

        this.boxes = [];
        this.box = null;

        // Positions
        this.positions = {};  // {ind: [{price, time}, {price, time}, color]}

        // Profit Losses
        this.profitLosses = [];
        this.profitLossIndex = null;
        this.hoveredProfitLossIndex = null;

        this.updateLineTimeoutId = null;
        this.handleLineHoverTimeoutId = null;
        this.handleDraggingTimeoutId = null;

        this.isHovered = false;
        this.hoveredIndex = -1;
        this.selectedPoint = null;
        this.hoverThreshold = .01;

        this.isDragging = false;
        this.dragStartPoint = null;
        this.dragStartLineData = null;

        this.lastCrosshairPosition = null;

        this.domElement = document.getElementById('tvchart');
        this.containerElement = document.getElementById('tvchart-container');
        this.overlayCanvas = document.getElementById('overlayCanvas');

        this.chartProperties = {
            width: this.containerElement.clientWidth,
            height: this.containerElement.clientHeight,
            layout: {
                background: { color: '#ffffff' },
                textColor: '#333',
            },
            grid: {
                vertLines: { color: '#f0f0f0' },
                horzLines: { color: '#f0f0f0' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#f0f0f0',
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#f0f0f0',
                fixLeftEdge: false,
                fixRightEdge: false,
            }
        };

        this.initializeChart();

        this.renderChart(chartData).then(() => {
            this.subscribeToEvents();
        });
    }

    selectTool(tool) {
        // Reset things when a new tool is selected
        if (this.lines.length > 0 && this.hoveredIndex !== -1 && this.lines[this.hoveredIndex]) {
            this.chart.removeSeries(this.lines[this.hoveredIndex]);
            this.lines.splice(this.hoveredIndex, 1);
        }
        this.hoveredIndex = -1;
        this.isDragging = false;
        this.dragStartPoint = null;
        this.dragStartLineData = null;
        this.startPoint = null;


        if (tool === 'btnTrendLine') {
            this.currentTool = 'trendLine';
        } else if (tool === 'btnCrosshair') {
            this.currentTool = 'crosshair';
        } else if (tool === 'btnBox') {
            this.currentTool = 'box';
        } else if (tool === 'btnProfitLoss') {
            this.currentTool = 'profitLoss';
        }
    }

    addLineSeries() {
        let lineSeries = this.chart.addSeries(LightweightCharts.LineSeries, {
            color: 'dodgerblue',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
        });
        this.lines.push(lineSeries);
    }

    openPosition(ind, price, time, color) {
        this.positions[ind] = [{price: price, time: time}, null, color];
    }

    closePosition(ind, price, time) {
        this.positions[ind][1] = {price: price, time: time};
    }

    // addBoxSeries() {
    //     let boxSeries = this.chart.addSeries(LightweightCharts.BoxSeries, {
    //         color: 'dodgerblue',
    //         lineWidth: 2,
    //         lineStyle: LightweightCharts.LineStyle.Solid,
    //     });
    //     this.boxes.push(boxSeries);
    // }

    initializeChart() {
        this.chart = LightweightCharts.createChart(this.domElement, this.chartProperties);
        this.candleseries = this.chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
    }

    async getData() {
        let endDate = new Date('2025-03-27');
        const daysBack = 7;
        const apiUrl = `/api/candles?ticker=${encodeURIComponent(this.currentTicker)}&interval=${encodeURIComponent(this.selectedInterval)}&endDate=${endDate.toISOString()}&daysBack=${daysBack}`;
    
        const response = await fetch(apiUrl).then(res => res.json());
    
        if (response.success) {
            return response.data;
        } else {
            return []
        }
    }

    resetTools() {
        this.boxes = [];
        this.overlayCanvas.getContext('2d').clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        while (this.lines.length > 0) {
            this.chart.removeSeries(this.lines[this.lines.length - 1]);
            this.lines.pop();
        }

        this.box = null;
        this.startPoint = null;
        this.isUpdatingLine = null;
        this.isDragging = false;
        this.dragStartPoint = null;
        this.dragStartLineData = null;
        this.hoveredIndex = -1;
        this.selectedPoint = null;
        this.lastCrosshairPosition = null;
        this.isHovered = false;
        
        this.positions = {};

        this.profitLosses = [];
        this.profitLossIndex = null;
        this.hoveredProfitLossIndex = null;
        
    }
    
    async renderChart(klinedata) {
    
        // const klinedata = await this.getData();
    
        // Format the data to match TradingView's expected format
        this.klines = klinedata.map(candle => ({
            time: Math.floor(new Date(candle.time).setMinutes(new Date(candle.time).getMinutes() - new Date(candle.time).getTimezoneOffset()) / 1000), // Convert to Unix timestamp
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));

        if (this.klines.length > 0) {
            this.hoverThreshold = this.klines[this.klines.length - 1].high / 15000;
        }

        if (this.klines.length === 0) return [];

        // let min_time = this.klines[0].time - ((1000) + 1) * this.xspan
        // let max_time = this.klines[this.klines.length - 1].time + (1000 + 1) * this.xspan

        

        const prebars = [];
        for (let i = 0; i < 1000; i++) {
            prebars.push({
                time: this.klines[0].time - ((1000 - i) + 1) * this.xspan,
            });
        }
        const postbars = [];
        for (let i = 0; i < 1000; i++) {
            postbars.push({
                time: this.klines[this.klines.length - 1].time + (i + 1) * this.xspan,
            });
        }

        this.klines = [...prebars, ...this.klines, ...postbars];

        this.candleseries.setData(this.klines);
    
        // Handle window resize
        window.addEventListener('resize', () => {
            this.chart.applyOptions({
                width: this.containerElement.clientWidth,
                height: this.containerElement.clientHeight,
            });
        });

        this.resizeCanvas();

        this.drawBoxes();
        this.drawPositions();
        this.drawProfitLosses();
    }

    subscribeToEvents() {
        this.chart.subscribeCrosshairMove(this.handleCrosshairMove.bind(this));
        this.chart.subscribeClick(this.handleChartClick.bind(this));
        this.domElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.domElement.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.domElement.addEventListener('contextmenu', (event) => {
            event.preventDefault(); // Prevent the default context menu from appearing
        });
        this.domElement.addEventListener('contextmenu', this.handleRightClick.bind(this));
        window.addEventListener('resize', this.resizeCanvas.bind(this));

        this.domElement.addEventListener('wheel', this.handleWheel.bind(this));
    }

    handleWheel(event) {
        event.preventDefault();
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            if (this.isBoxHovered(this.boxes[i][0])) {
                if (event.deltaY < 0) {
                    this.boxes[i][1] = '0, 255, 0';
                } else {
                    this.boxes[i][1] = '255, 0, 0'
                }
                this.overlayCanvas.getContext('2d').clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                this.drawBoxes();
                break;
            }
        }
    }

    resizeCanvas() {
        if (!this.chart) return;
        this.overlayCanvas.width = this.containerElement.clientWidth;
        this.overlayCanvas.height = this.containerElement.clientHeight;
    }

    handleRightClick(event) {

        if (this.hoveredIndex !== -1 && this.lines[this.hoveredIndex]) {
            this.chart.removeSeries(this.lines[this.hoveredIndex]);
            this.lines.splice(this.hoveredIndex, 1);
            this.hoveredIndex = -1;
        }

        this.deleteHoveredBoxes();

        
        this.deleteHoveredProfitLosses();

        this.chart.applyOptions({
            handleScroll: true, handleScale: true
        });

    }

    deleteHoveredBoxes() {
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            if (this.isBoxHovered(this.boxes[i][0])) {
                this.boxes.splice(i, 1);
                i--;
            }
        }
    }

    deleteHoveredProfitLosses() {
        if (this.hoveredProfitLossIndex != null) {
            this.profitLosses.splice(this.hoveredProfitLossIndex[0], 1);
            this.hoveredProfitLossIndex = null;
        }
    }

    handleCrosshairMove(param) {
        if (this.klines.length === 0) return;
        if (!param.point) return;
        const xTs = param.time ? param.time : this.klines[0]["time"] + param.logical * this.xspan;
        const yPrice = this.candleseries.coordinateToPrice(param.point.y);

        // console.log(xTs, yPrice);
        this.lastCrosshairPosition = {x: xTs, y: yPrice};

        if (this.startPoint) {
            clearTimeout(this.updateLineTimeoutId);
            this.updateLineTimeoutId = setTimeout(() => {
                this.updateLine(xTs, yPrice);
            }, .001);
        }

        this.overlayCanvas.getContext('2d').clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        if (this.box) {
            this.drawBox([{x1: this.box[0].x1, y1: this.box[0].y1, x2: xTs, y2: yPrice}, this.box[1]]);
        }

        let one_hover = false;

        if (this.currentTool == 'box') {
            for (let i = 0; i < this.boxes.length; i++) {
                let hover = this.isBoxHovered(this.boxes[i][0])
                if (hover) {
                    one_hover = true;
                }
                this.drawBox(this.boxes[i], hover);
            }
            if (!one_hover && this.hoveredIndex === -1) {
                this.chart.applyOptions({
                    handleScroll: true, handleScale: true
                });
            } else {
                this.chart.applyOptions({
                    handleScroll: false, handleScale: false
                });
            }
        } else if (this.currentTool == 'profitLoss') {
            if (this.profitLossIndex != null && this.isDragging) {
                if (yPrice > this.profitLosses[this.profitLossIndex].price) {
                    this.profitLosses[this.profitLossIndex].top = yPrice;
                    this.profitLosses[this.profitLossIndex].bottom = this.profitLosses[this.profitLossIndex].price - (yPrice - this.profitLosses[this.profitLossIndex].price);
                    this.profitLosses[this.profitLossIndex].side = 'sell';
                } else if (yPrice < this.profitLosses[this.profitLossIndex].price) {
                    this.profitLosses[this.profitLossIndex].bottom = yPrice;
                    this.profitLosses[this.profitLossIndex].top = this.profitLosses[this.profitLossIndex].price + (this.profitLosses[this.profitLossIndex].price - yPrice);
                    this.profitLosses[this.profitLossIndex].side = 'buy';
                }
                this.profitLosses[this.profitLossIndex].endTime = xTs;
            }
        }


        if (this.hoveredProfitLossIndex != null && this.isDragging) {
            if (this.hoveredProfitLossIndex[1] == 'top') {
                if (yPrice > this.profitLosses[this.hoveredProfitLossIndex[0]].price) {
                    this.profitLosses[this.hoveredProfitLossIndex[0]].top = yPrice;
                }
            } else if (this.hoveredProfitLossIndex[1] == 'bottom') {
                if (yPrice < this.profitLosses[this.hoveredProfitLossIndex[0]].price) {
                    this.profitLosses[this.hoveredProfitLossIndex[0]].bottom = yPrice;
                }
            } 
            else if (this.hoveredProfitLossIndex[1] == 'start') {
                this.profitLosses[this.hoveredProfitLossIndex[0]].startTime = xTs;
            } else if (this.hoveredProfitLossIndex[1] == 'end') {
                this.profitLosses[this.hoveredProfitLossIndex[0]].endTime = xTs;
            }
        }
        
        this.drawPositions();
        this.drawProfitLosses();


        clearTimeout(this.handleLineHoverTimeoutId);
        this.handleLineHoverTimeoutId = setTimeout(() => {
            this.handleHoverEffectProfitLoss(xTs, yPrice);
            this.handleHoverEffect(xTs, yPrice);
        }, 1);

        clearTimeout(this.handleDraggingTimeoutId);
        this.handleDraggingTimeoutId = setTimeout(() => {
            this.handleDragging(xTs, yPrice);
        }, 1);
            


    }

    isBoxHovered(box) {
        if (this.lastCrosshairPosition) {
            if ((this.lastCrosshairPosition['x'] >= box.x1 && this.lastCrosshairPosition['x'] <= box.x2) || (this.lastCrosshairPosition['x'] <= box.x1 && this.lastCrosshairPosition['x'] >= box.x2)) {
                if ((this.lastCrosshairPosition['y'] >= box.y1 && this.lastCrosshairPosition['y'] <= box.y2) || (this.lastCrosshairPosition['y'] <= box.y1 && this.lastCrosshairPosition['y'] >= box.y2)) {
                    return true;
                }
            }
        }
        return false;
    }

    drawBoxes() {
        for (let i = 0; i < this.boxes.length; i++) {
            let hover = this.isBoxHovered(this.boxes[i][0])
            
            this.drawBox(this.boxes[i], hover);
        }

        // Draw positions
        this.drawPositions();
    }

    drawBox(box, hover=false) {
        const ctx = this.overlayCanvas.getContext('2d');
        let { x1, y1, x2, y2 } = box[0]
        
        if (x1 > this.klines[this.klines.length - 1].time) {
            x1 = this.klines[this.klines.length - 1].time;
        } else if (x1 < this.klines[0].time) {
            x1 = this.klines[0].time;
        }
        if (x2 > this.klines[this.klines.length - 1].time) {
            x2 = this.klines[this.klines.length - 1].time;
        } else if (x2 < this.klines[0].time) {
            x2 = this.klines[0].time;
        }

        if (x1 && x2 && y1 && y2) {
            ctx.fillStyle = `rgba(${box[1]}, 0.3)`; // Semi-transparent orange
            ctx.fillRect(
                this.chart.timeScale().timeToCoordinate(x1),
                this.candleseries.priceToCoordinate(y1),
                this.chart.timeScale().timeToCoordinate(x2) - this.chart.timeScale().timeToCoordinate(x1),
                this.candleseries.priceToCoordinate(y2) - this.candleseries.priceToCoordinate(y1)
            );

            if (hover) {
                ctx.strokeStyle = `rgba(${box[1]}, 1)`;
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    this.chart.timeScale().timeToCoordinate(x1),
                    this.candleseries.priceToCoordinate(y1),
                    this.chart.timeScale().timeToCoordinate(x2) - this.chart.timeScale().timeToCoordinate(x1),
                    this.candleseries.priceToCoordinate(y2) - this.candleseries.priceToCoordinate(y1)
                );
            }
        }
    }

    getCandleWidth() {
        let candleWidth = this.chart.timeScale().timeToCoordinate(this.klines[1].time) - this.chart.timeScale().timeToCoordinate(this.klines[0].time);
        if (this.domElement) {
            return Math.min(this.domElement.clientWidth / 100, candleWidth);
        }
        return candleWidth;
    }

    drawPosition(pos) {
        const ctx = this.overlayCanvas.getContext('2d');
        if (pos[0] == null) return;

        let price = pos[0].price;
        let time = Math.floor(new Date(pos[0].time).setMinutes(new Date(pos[0].time).getMinutes() - new Date(pos[0].time).getTimezoneOffset()) / 1000);

        // Adjust time to the nearest xspan
        let nearestXspan = Math.floor(time / this.xspan) * this.xspan; // Round down to the nearest xspan
        // let nearestXspan = Math.round(time / this.xspan) * this.xspan;
        // Get coordinates of entry price
        let entryX = this.chart.timeScale().timeToCoordinate(nearestXspan);
        let entryY = this.candleseries.priceToCoordinate(price);

        // Entry position
        // Draw a circle at the entry price
        ctx.beginPath();
        ctx.arc(entryX, entryY, this.getCandleWidth() / 2, 0, 2 * Math.PI); // Increased radius to 10 for a bigger circle
        ctx.fillStyle = `rgba(${pos[2]}, .3)`;
        ctx.fill();

        // Draw a small horizontal line at the entry price
        ctx.beginPath();
        ctx.moveTo(entryX - this.getCandleWidth() / 2, entryY);
        ctx.lineTo(entryX + this.getCandleWidth() / 2, entryY);
        ctx.strokeStyle = `rgba(10, 10, 10, 1)`;
        ctx.stroke();

        // Draw a small vertical line at the entry price
        ctx.beginPath();
        ctx.moveTo(entryX, entryY - this.getCandleWidth() / 2);
        ctx.lineTo(entryX, entryY + this.getCandleWidth() / 2);
        ctx.strokeStyle = `rgba(10, 10, 10, 1)`;
        ctx.stroke();

        // Close position
        nearestXspan = Math.floor(this.klines[this.klines.length - 1].time / this.xspan) * this.xspan; // Round to the nearest xspan
        let closeX = this.chart.timeScale().timeToCoordinate(nearestXspan);
        let closeY = this.candleseries.priceToCoordinate(this.klines[this.klines.length - 1].close);
        
        if (pos[1] != null) {
            let time = Math.floor(new Date(pos[1].time).setMinutes(new Date(pos[1].time).getMinutes() - new Date(pos[1].time).getTimezoneOffset()) / 1000);
            nearestXspan = Math.floor(time / this.xspan) * this.xspan; // Round to the nearest xspan
            closeX = this.chart.timeScale().timeToCoordinate(nearestXspan);
            closeY = this.candleseries.priceToCoordinate(pos[1].price);
        }
        // Draw a circle at the close price
        ctx.beginPath();
        ctx.arc(closeX, closeY, this.getCandleWidth() / 2, 0, 2 * Math.PI); // Increased radius to 10 for a bigger circle
        ctx.fillStyle = `rgba(${pos[2]}, .3)`;
        ctx.fill();

        // Draw a small horizontal line at the close price
        ctx.beginPath();
        ctx.moveTo(closeX - this.getCandleWidth() / 2, closeY);
        ctx.lineTo(closeX + this.getCandleWidth() / 2, closeY);
        ctx.strokeStyle = `rgba(10, 10, 10, 1)`;
        ctx.stroke();

        // Draw a small vertical line at the close price
        ctx.beginPath();
        ctx.moveTo(closeX, closeY - this.getCandleWidth() / 2);
        ctx.lineTo(closeX, closeY + this.getCandleWidth() / 2);
        ctx.strokeStyle = `rgba(10, 10, 10, 1)`;
        ctx.stroke();
        

        // Draw a line connecting the entry and close prices
        ctx.beginPath();
        ctx.moveTo(entryX, entryY);
        ctx.lineTo(closeX, closeY);
        ctx.strokeStyle = `rgba(${pos[2]}, 1)`;
        ctx.stroke();
    }

    drawPositions() {
        for (let ind in this.positions) {
            let pos = this.positions[ind];
            this.drawPosition(pos)
        }
    }

    drawProfitLoss(pl, hover=null) {
        // pl - {time, price, top, bottom}

        let ctx = this.overlayCanvas.getContext('2d');

        let nearestXspan = Math.floor(pl.startTime / this.xspan) * this.xspan;
        let startX = this.chart.timeScale().timeToCoordinate(nearestXspan);
        nearestXspan = Math.floor(pl.endTime / this.xspan) * this.xspan;
        if (nearestXspan == startX) {
            nearestXspan += this.xspan;
        }
        let endX = this.chart.timeScale().timeToCoordinate(nearestXspan);

        if (startX == endX) {
            endX = startX + this.xspan;
        }

        let middle = pl.price;
        let top = pl.top;
        let bottom = pl.bottom;

        if (top == null && bottom == null) return;

        if (top == null) {
            top = middle + (middle - bottom);
        } else if (bottom == null) {
            bottom = middle - (top - middle);
        }

        let topY = this.candleseries.priceToCoordinate(top);
        let bottomY = this.candleseries.priceToCoordinate(bottom);
        let middleY = this.candleseries.priceToCoordinate(middle);

        let colorTop = pl.side == 'sell' ? 'rgba(255, 0, 0, .3)' : 'rgba(0, 255, 0, .3)';
        let colorBottom = pl.side == 'buy' ? 'rgba(255, 0, 0, .3)' : 'rgba(0, 255, 0, .3)';

        let colorTopSolid = pl.side == 'sell' ? 'rgba(255, 0, 0, 1)' : 'rgba(0, 255, 0, 1)';
        let colorBottomSolid = pl.side == 'buy' ? 'rgba(255, 0, 0, 1)' : 'rgba(0, 255, 0, 1)';
        // Draw top, middle, and bottom line
        ctx.beginPath();
        ctx.moveTo(startX, topY);
        ctx.lineTo(endX, topY);
        ctx.strokeStyle = colorTop;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startX, bottomY);
        ctx.lineTo(endX, bottomY);
        ctx.strokeStyle = colorBottom;
        ctx.stroke();


        // Fill in the area between the top and bottom with a rectangle
        ctx.beginPath();
        ctx.moveTo(startX, topY);
        ctx.lineTo(endX, topY);
        ctx.lineTo(endX, middleY);
        ctx.lineTo(startX, middleY);
        ctx.closePath();
        ctx.fillStyle = colorTop;
        ctx.fill();

        // Fill in the area between the middle and bottom with a rectangle
        ctx.beginPath();
        ctx.moveTo(startX, middleY);
        ctx.lineTo(endX, middleY);
        ctx.lineTo(endX, bottomY);
        ctx.lineTo(startX, bottomY);
        ctx.closePath();
        ctx.fillStyle = colorBottom;
        ctx.fill();
        
        
        if (hover != null) {
            if (hover == 'top') {
                // Draw a circle at the top
                ctx.beginPath();
                ctx.arc(startX + (endX - startX) / 2, topY, this.getCandleWidth() / 2, 0, 2 * Math.PI);
                ctx.fillStyle = colorTopSolid;
                ctx.fill();
            } else if (hover == 'bottom') {
                ctx.beginPath();
                ctx.arc(startX + (endX - startX) / 2, bottomY, this.getCandleWidth() / 2, 0, 2 * Math.PI);
                ctx.fillStyle = colorBottomSolid;
                ctx.fill();
            } else if (hover == 'start') {
                ctx.beginPath();
                ctx.arc(startX, middleY, this.getCandleWidth() / 2, 0, 2 * Math.PI);
                ctx.fillStyle = colorTopSolid;
                ctx.fill();
            } else if (hover == 'end') {
                ctx.beginPath();
                ctx.arc(endX, middleY, this.getCandleWidth() / 2, 0, 2 * Math.PI);
                ctx.fillStyle = colorBottomSolid;
                ctx.fill();
            }
        }

        let lots = document.querySelector('#trade-lots')
        if (lots && !isNaN(lots.value)) {
            let lotsValue = parseFloat(lots.value);
            if (lotsValue > 0) {
                let price = pl.price;
                let loss = pl.side == 'sell' ? ((top - price) * lotsValue) : ((price - bottom) * lotsValue);
                if (pl.side == 'sell') {
                    // Show text on top of the profit loss
                    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                    ctx.font = '12px Arial';
                    ctx.fillText(`Loss: ${loss.toFixed(2)}`, startX + (endX - startX) / 2, topY - 10);
                } else {
                    // Show text on bottom of the profit loss
                    ctx.fillStyle = 'rgba(0, 0, 0, 1)'; 
                    ctx.font = '12px Arial';
                    ctx.fillText(`Loss: ${loss.toFixed(2)}`, startX + (endX - startX) / 2, bottomY + 10);
                }
            }
        }

        if (pl.side == 'sell') {
            // Show text multiplier on the bottom of the profit loss
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            ctx.font = '12px Arial';
            ctx.fillText(`${((middle - bottom) / (top - middle)).toFixed(2)}x`, startX + (endX - startX) / 2, bottomY + 10);
        } else {
            // Show text multiplier on the top of the profit loss
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            ctx.font = '12px Arial';
            ctx.fillText(`${((top - middle) / (middle - bottom)).toFixed(2)}x`, startX + (endX - startX) / 2, topY - 10);
        }
        

    }

    drawProfitLosses() {
        for (let i = 0; i < this.profitLosses.length; i++) {
            this.drawProfitLoss(this.profitLosses[i], this.hoveredProfitLossIndex && this.hoveredProfitLossIndex[0] == i ? this.hoveredProfitLossIndex[1] : null);
        }
    }

    handleDragging(xTs, yPrice) {
        if (this.hoveredProfitLossIndex != null && this.isDragging) return;
        if (this.isDragging) {
            const deltaX = xTs - this.dragStartPoint.time;
            const deltaY = yPrice - this.dragStartPoint.price;

            if (this.currentTool == 'profitLoss') {
                if (this.profitLossIndex == null) return;
            } else if (this.currentTool == 'trendLine') {
                let newLineData;
                newLineData = this.dragStartLineData.map((point, i) =>
                    this.selectedPoint !== null
                    ? i === this.selectedPoint
                        ? { time: point.time + deltaX, value: point.value + deltaY }
                            : point 
                    : { time: point.time + deltaX, value: point.value + deltaY }
                );
                this.dragLine(newLineData);
            }
        }
    }

    handleChartClick(param) {
        // if (this.isUpdatingLine) return;
        const xTs = param.time ? param.time : this.klines[0]["time"] + param.logical * this.xspan;
        const yPrice = this.candleseries.coordinateToPrice(param.point.y);
        if (this.currentTool === 'trendLine') {
            this.handleLineDrawing(xTs, yPrice);
        } else if (this.currentTool === 'box') {
            this.handleBoxDrawing(xTs, yPrice);
        }
    }

    handleBoxDrawing(xTs, yPrice) {
        if (!this.box) {
            this.box = [{
                x1: xTs,
                y1: yPrice,
                x2: null,
                y2: null,
            }, '0, 255, 0']
        } else {
            this.boxes.push([{
                x1: this.box[0].x1,
                y1: this.box[0].y1,
                x2: xTs,
                y2: yPrice,
            }, this.box[1]])
            this.box = null;
        }
    }

    handleLineDrawing(xTs, yPrice) {
        try {
            if (!this.startPoint) {
                this.startPoint = {time: xTs, price: yPrice};
                this.addLineSeries();
            } else {
                let t1 = this.startPoint.time;
                let t2 = xTs;
                let p1 = this.startPoint.price;
                let p2 = yPrice;
                if (t1 > t2) {
                    [t1, t2] = [t2, t1];
                    [p1, p2] = [p2, p1];
                }
                this.lines[this.lines.length - 1].setData([
                    {time: t1, value: p1}, 
                    {time: t2, value: p2}
                ]);
                this.startPoint = null;
            }
        } catch (error) {
        }
    }

    updateLine(xTs, yPrice) {
        try {
            if (!this.startPoint) return;
            this.isUpdatingLine = true;
            let t1 = this.startPoint.time;
            let t2 = xTs;
            let p1 = this.startPoint.price;
            let p2 = yPrice;
            if (t1 > t2) {
                [t1, t2] = [t2, t1];
                [p1, p2] = [p2, p1];
            }
            this.lines[this.lines.length - 1].setData([
                {time: t1, value: p1}, 
                {time: t2, value: p2}
            ]);
            this.isUpdatingLine = false;
        } catch (error) {
        }
    }

    handleHoverEffect(xTs, yPrice) {
        if (this.lines.length === 0) return;
    
        for (let i = 0; i < this.lines.length; i++) {
            const linedata = this.lines[i].data();
            if (!linedata.length) continue;
            const hoverStatus = this.isLineHovered(
                xTs,
                yPrice,
                linedata[0],
                linedata[1]
            );

            if (!this.isDragging && hoverStatus && this.hoveredIndex !== i) {
                this.startHover(i);
            } else if (!this.isDragging && !hoverStatus && this.hoveredIndex === i) {
                this.endHover(i);
            }
        }
}

    handleHoverEffectProfitLoss(xTs, yPrice) {
        if (this.profitLosses.length === 0 || this.isDragging) return;
        
        let one_hover = false;
        let left_right_hover = false;
        for (let i = 0; i < this.profitLosses.length; i++) {
            const pl = this.profitLosses[i];
            if (pl.bottom == null && pl.top == null) continue;
            
            if (pl.bottom != null) {
                if (this.isLineHovered(xTs, yPrice, {value: pl.bottom, time: pl.startTime}, {value: pl.bottom, time: pl.endTime}, true)) {
                    this.hoveredProfitLossIndex = [i, 'bottom']
                    one_hover = true;
                }
            }
            if (pl.top != null) {
                if (this.isLineHovered(xTs, yPrice, {value: pl.top, time: pl.startTime}, {value: pl.top, time: pl.endTime}, true)) {
                    this.hoveredProfitLossIndex = [i, 'top']
                    one_hover = true;
                }
            }
            if (!one_hover) {
                if (pl.startTime != null) {
                    if (this.isLineHovered(xTs, yPrice, {value: pl.bottom, time: pl.startTime}, {value: pl.top, time: pl.startTime}, true)) {
                        this.hoveredProfitLossIndex = [i, 'start']
                        one_hover = true;
                        left_right_hover = true;
                    }
                }
                if (pl.endTime != null) {
                    if (this.isLineHovered(xTs, yPrice, {value: pl.bottom, time: pl.endTime}, {value: pl.top, time: pl.endTime}, true)) {
                        this.hoveredProfitLossIndex = [i, 'end']
                        one_hover = true;
                        left_right_hover = true;
                    }
                }
            }
        }
        if (!one_hover) {
            this.hoveredProfitLossIndex = null;
            document.querySelector('#tvchart-container').style.cursor = 'crosshair';
            document.querySelector('#tvchart').style.cursor = 'crosshair';
        } else {
            document.querySelector('#tvchart-container').style.cursor = 'ns-resize';
            document.querySelector('#tvchart').style.cursor = left_right_hover ? 'ew-resize' : 'ns-resize';
        }
    }

    isLineHovered(xTs, yPrice, point1, point2, pl=false) {

        const candleWidth = this.getCandleWidth();

        // Convert centerY to a price value
        const priceAtTop= this.candleseries.coordinateToPrice(0);

        // Move 6 pixels downward (positive y-direction), get the price at that coordinate
        const priceXPixelsDown = this.candleseries.coordinateToPrice(candleWidth);

        let tolerance = Math.abs(priceAtTop - priceXPixelsDown);

        // if (pl) {
        //     // let nearestXspan = Math.floor(xTs / this.xspan) * this.xspan;
        //     // xTs = nearestXspan;
        //     xTs -= this.xspan;
        // }

        
        const isPoint1 = xTs === point1.time && (Math.abs(yPrice - point1.value)) < tolerance;
        if (isPoint1 && !this.isDragging) {
            this.selectedPoint = 0;
            return true;
        }

        const isPoint2 = xTs === point2.time && (Math.abs(yPrice - point2.value)) < tolerance;
        if (isPoint2 && !this.isDragging) {
            this.selectedPoint = 1;
            return true;
        }

        if (!this.isDragging) {
            this.selectedPoint = null;
        }
    
        // Check if xTs is between the two points
        const minTime = Math.min(point1.time, point2.time);
        const maxTime = Math.max(point1.time, point2.time);
    
        if (xTs < minTime || xTs > maxTime) {
            return false;
        }

        if (point2.time == point1.time) {
            let minPrice = Math.min(point1.value, point2.value);
            let maxPrice = Math.max(point1.value, point2.value);
            return yPrice >= minPrice && yPrice <= maxPrice;
        }
    
        // Calculate line Y at xTs
        let m = (point2.value - point1.value) / (point2.time - point1.time);
        const c = point1.value - m * point1.time;
        const estimatedY = m * xTs + c;
    
        // Now compare estimatedY with yPrice
        const yDiff = Math.abs(yPrice - estimatedY);
        return yDiff < tolerance;
    }

    startHover(i) {
        this.hoveredIndex = i;
        this.lines[i].applyOptions({
            color: "orange",
        });
        this.domElement.style.cursor = "pointer";
        this.chart.applyOptions({
            handleScroll: false, handleScale: false
        });
    }

    endHover(i) {
        this.hoveredIndex = -1;
        this.lines[i].applyOptions({
            color: "dodgerblue",
        });
        this.domElement.style.cursor = "default";
        this.chart.applyOptions({
            handleScroll: true, handleScale: true
        })
    }


    handleMouseDown(event) {
        if (event.button != 0) return;
        if (!this.lastCrosshairPosition) return;
        if (this.hoveredProfitLossIndex != null) {
            this.chart.applyOptions({
                handleScroll: false, handleScale: false
            });
            this.isDragging = true;
        } else if (this.currentTool == 'trendLine') {
            if (this.hoveredIndex !== -1) {
                this.startDrag(
                    this.lastCrosshairPosition.x,
                    this.lastCrosshairPosition.y
                );
            }
        } else if (this.currentTool == 'profitLoss') {
            if (this.profitLossIndex == null) {
                this.profitLosses.push({startTime: this.lastCrosshairPosition.x, endTime: this.lastCrosshairPosition.x, price: this.lastCrosshairPosition.y, top: null, bottom: null, side: null});
                this.profitLossIndex = this.profitLosses.length - 1;
                this.startDrag(
                    this.lastCrosshairPosition.x,
                    this.lastCrosshairPosition.y
                );
            }

        }
    }

    startDrag(xTs, yPrice) {
        this.isDragging = true;
        this.dragStartPoint = {time: xTs, price: yPrice};
        this.chart.applyOptions({
            handleScroll: false, handleScale: false
        });
        if (this.currentTool == 'profitLoss') {
            this.dragStartLineData = this.profitLosses[this.profitLossIndex];
        } else {
            this.dragStartLineData = this.lines[this.hoveredIndex].data();
        }
    }

    dragLine(newCords) {
        try {
            this.isUpdatingLine = true;
            this.lines[this.hoveredIndex].setData(newCords);
            this.isUpdatingLine = false;
        } catch (error) {
        }
    }
    
    handleMouseUp() {
        if (event.button != 0) return;
        this.endDrag();
        if (this.profitLossIndex != null) {
            if (this.profitLosses[this.profitLossIndex].top != null || this.profitLosses[this.profitLossIndex].bottom != null) {
                if (this.profitLosses[this.profitLossIndex].top == null) {
                    this.profitLosses[this.profitLossIndex].top = this.profitLosses[this.profitLossIndex].price + (this.profitLosses[this.profitLossIndex].price - this.profitLosses[this.profitLossIndex].bottom);
                } else if (this.profitLosses[this.profitLossIndex].bottom == null) {
                    this.profitLosses[this.profitLossIndex].bottom = this.profitLosses[this.profitLossIndex].price - (this.profitLosses[this.profitLossIndex].top - this.profitLosses[this.profitLossIndex].price);
                }
            }
            this.profitLossIndex = null;
        }
        if (this.hoveredProfitLossIndex != null) {
            this.hoveredProfitLossIndex = null;
        }
        this.chart.applyOptions({
            handleScroll: true, handleScale: true
        });
    }

    endDrag() {
        this.isDragging = false;
        this.dragStartPoint = null;
        this.dragStartLineData = null;
        this.selectedPoint = null;
    }
}


// const chartManager = new ChartManager();