// ABAP Code snippets for showcase
const ABAP_CODE_SNIPPETS = {
    rfc_sensor: `*&---------------------------------------------------------------------*
*& RFC: Z_RFC_RECEIVE_TELEMETRY
*& Description: Triggered by OPC UA Gateway to load IoT sensor packets.
*&---------------------------------------------------------------------*
FUNCTION z_rfc_receive_telemetry.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IM_MACHINE_ID) TYPE  CHAR20
*"     VALUE(IM_TEMP) TYPE  DEC5_2
*"     VALUE(IM_VIBRA) TYPE  DEC5_2
*"     VALUE(IM_SPEED) TYPE  INT4
*"  EXPORTING
*"     VALUE(EX_STATUS) TYPE  CHAR2
*"----------------------------------------------------------------------
  DATA: ls_telem TYPE ztfactory_telem.

  ls_telem-mandt      = sy-mandt.
  ls_telem-machine_id = im_machine_id.
  ls_telem-timestamp  = sy-datum && sy-uzeit.
  ls_telem-temp_val   = im_temp.
  ls_telem-vibra_val  = im_vibra.
  ls_telem-line_speed = im_speed.

  INSERT ztfactory_telem FROM ls_telem.
  
  IF sy-subrc = 0.
    ex_status = 'OK'.
  ELSE.
    ex_status = 'ER'.
  ENDIF.
ENDFUNCTION.`,

    bapi_goods: `*&---------------------------------------------------------------------*
*& Report: Z_AUTOMATED_GOODS_ISSUE
*& Description: Registers raw parts issue dynamically using BAPI.
*&---------------------------------------------------------------------*
FORM post_goods_issue 
  USING im_order   TYPE maufnr
        im_material TYPE matnr
        im_qty      TYPE mnglg.

  DATA: ls_header TYPE bapi2017_gm_head_01,
        ls_code   TYPE bapi2017_gm_code,
        lt_items  TYPE TABLE OF bapi2017_gm_item_create,
        ls_item   TYPE bapi2017_gm_item_create.

  ls_header-pstng_date = sy-datum.
  ls_header-doc_date   = sy-datum.
  ls_code-gm_code      = '03'. " Movement for Production Order

  ls_item-material   = im_material.
  ls_item-plant      = '1000'.
  ls_item-stge_loc   = '0001'.
  ls_item-move_type  = '261'. " Goods issue for order
  ls_item-entry_qnt  = im_qty.
  ls_item-orderid    = im_order.
  APPEND ls_item TO lt_items.

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_header
      goodsmvt_code    = ls_code
    IMPORTING
      materialdocument = DATA(lv_mat_doc)
    TABLES
      goodsmvt_item    = lt_items
      return           = DATA(lt_return).

  READ TABLE lt_return WITH KEY type = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc <> 0.
    COMMIT WORK AND WAIT.
  ELSE.
    ROLLBACK WORK.
  ENDIF.
ENDFORM.`,

    bapi_conf: `*&---------------------------------------------------------------------*
*& Report: Z_PROD_ORDER_CONFIRMATION
*& Description: Confirms assembly operations using SAP BAPI.
*&---------------------------------------------------------------------*
FORM confirm_production_yield
  USING im_order TYPE maufnr
        im_yield TYPE mnglg.

  DATA: lt_timetickets TYPE TABLE OF bapi_pp_timeticket,
        ls_ticket      TYPE bapi_pp_timeticket,
        lt_return      TYPE TABLE OF bapiret2.

  ls_ticket-orderid     = im_order.
  ls_ticket-operation   = '0010'. " Assembly Step 1
  ls_ticket-yield       = im_yield.
  ls_ticket-postg_date  = sy-datum.
  ls_ticket-conf_text   = 'Automated IoT Confirmation'.
  APPEND ls_ticket TO lt_timetickets.

  CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
    TABLES
      timetickets = lt_timetickets
      detail_return = DATA(lt_detail)
      return       = lt_return.

  READ TABLE lt_return WITH KEY type = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc <> 0.
    COMMIT WORK.
  ELSE.
    " Logging error output to OPC UA stream
  ENDIF.
ENDFORM.`
};

// Simulation State
let state = {
    isRunning: true,
    speedPercent: 60,
    isEmergencyHalt: false,
    currentTab: 'rfc_sensor',
    
    // Telemetry Values
    telemetry: {
        oee: 88.4,
        productionRate: 140, // units/hr
        defectRate: 0.8,    // %
        targetProgress: 64, // %
        
        roboticArm: { temp: 42.5, vibra: 1.2, speed: 60 },
        cncMachine: { temp: 58.2, vibra: 2.4, speed: 60 },
        conveyor:   { temp: 28.1, vibra: 0.8, speed: 60 }
    },
    
    // SAP Production Orders
    orders: [
        { id: '1000284', material: 'Z_SMART_ROBOT_ARM', target: 200, confirmed: 148, active: true },
        { id: '1000285', material: 'Z_ROBOT_CHASSIS_C', target: 500, confirmed: 312, active: false },
        { id: '1000286', material: 'Z_CONVEYOR_BELT_P', target: 100, confirmed: 0, active: false }
    ]
};

// DOM Selector Cache
let elements = {};

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    setupEventListeners();
    renderABAPCode();
    renderSAPOrders();
    initDolphinAquarium();
    
    // Start Simulation Loop
    setInterval(updateSimulation, 1500);
    
    // Insert Initial Logs
    addConsoleLog('SYSTEM', 'ABAP OPC UA Gateway connecting to PLC Server...');
    setTimeout(() => addConsoleLog('SYSTEM', 'OPC UA Connection established. Streaming telemetry.'), 800);
});

function cacheElements() {
    elements = {
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        alarmOverlay: document.getElementById('alarm-overlay'),
        
        // Metrics
        valOee: document.getElementById('val-oee'),
        valProdRate: document.getElementById('val-prod-rate'),
        valDefectRate: document.getElementById('val-defect-rate'),
        valProgress: document.getElementById('val-progress'),
        progressBar: document.getElementById('progress-bar'),
        
        // Telemetry cards
        robotTemp: document.getElementById('robot-temp'),
        robotVibra: document.getElementById('robot-vibra'),
        robotSpeed: document.getElementById('robot-speed'),
        
        cncTemp: document.getElementById('cnc-temp'),
        cncVibra: document.getElementById('cnc-vibra'),
        cncSpeed: document.getElementById('cnc-speed'),
        
        conveyorTemp: document.getElementById('conveyor-temp'),
        conveyorVibra: document.getElementById('conveyor-vibra'),
        conveyorSpeed: document.getElementById('conveyor-speed'),
        
        // Control room
        btnStart: document.getElementById('btn-start'),
        btnPause: document.getElementById('btn-pause'),
        btnHalt: document.getElementById('btn-halt'),
        speedSlider: document.getElementById('speed-slider'),
        speedLabel: document.getElementById('speed-label'),
        
        // SAP Integration
        ordersList: document.getElementById('orders-list'),
        codeViewer: document.getElementById('code-viewer'),
        
        // Console log
        consoleBody: document.getElementById('console-body')
    };
}

function setupEventListeners() {
    // Control room actions
    elements.btnStart.addEventListener('click', () => {
        if (state.isEmergencyHalt) {
            state.isEmergencyHalt = false;
            elements.alarmOverlay.classList.remove('active');
            elements.statusDot.className = 'status-dot';
            elements.btnHalt.classList.remove('active-halt');
        }
        state.isRunning = true;
        elements.btnStart.classList.add('active-start');
        elements.btnPause.classList.remove('active-start');
        addConsoleLog('CONTROL', 'Production line started. Motor speed normal.');
    });
    
    elements.btnPause.addEventListener('click', () => {
        if (state.isEmergencyHalt) return;
        state.isRunning = false;
        elements.btnStart.classList.remove('active-start');
        elements.btnPause.classList.add('active-start');
        addConsoleLog('CONTROL', 'Production line paused. Ready to resume.');
    });
    
    elements.btnHalt.addEventListener('click', () => {
        state.isEmergencyHalt = true;
        state.isRunning = false;
        elements.alarmOverlay.classList.add('active');
        elements.statusDot.className = 'status-dot danger';
        elements.btnStart.classList.remove('active-start');
        elements.btnPause.classList.remove('active-start');
        elements.btnHalt.classList.add('active-halt');
        
        state.telemetry.productionRate = 0;
        state.speedPercent = 0;
        elements.speedSlider.value = 0;
        elements.speedLabel.innerText = '0%';
        
        addConsoleLog('ALARM', 'CRITICAL EMERGENCY HALT triggered! OPC UA motors locked.');
    });
    
    elements.speedSlider.addEventListener('input', (e) => {
        if (state.isEmergencyHalt) {
            elements.speedSlider.value = 0;
            return;
        }
        state.speedPercent = parseInt(e.target.value);
        elements.speedLabel.innerText = `${state.speedPercent}%`;
        
        if (state.speedPercent > 0 && !state.isRunning) {
            state.isRunning = true;
            elements.btnStart.classList.add('active-start');
            elements.btnPause.classList.remove('active-start');
        }
        
        addConsoleLog('CONTROL', `Conveyor Belt Speed adjusted to ${state.speedPercent}%`);
    });
    
    // Code tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentTab = e.target.dataset.tab;
            renderABAPCode();
        });
    });
}

// ----------------------------------------------------
// Real-Time Simulation Engine
// ----------------------------------------------------
function updateSimulation() {
    // If emergency halt or paused, stabilize telemetry values to ambient
    if (state.isEmergencyHalt || !state.isRunning) {
        decayTelemetry();
        renderTelemetry();
        return;
    }
    
    // 1. Calculate active telemetry parameters
    const speedRatio = state.speedPercent / 100;
    
    state.telemetry.productionRate = Math.round(200 * speedRatio);
    state.telemetry.defectRate = parseFloat((0.4 + (speedRatio * 0.9) + (Math.random() * 0.3)).toFixed(1));
    state.telemetry.oee = parseFloat((95 - (state.telemetry.defectRate * 2) - ((1 - speedRatio) * 5)).toFixed(1));
    
    // Robotic Arm Telemetry drift
    state.telemetry.roboticArm.temp = parseFloat((35 + (20 * speedRatio) + (Math.random() * 1.5)).toFixed(1));
    state.telemetry.roboticArm.vibra = parseFloat((0.5 + (1.2 * speedRatio) + (Math.random() * 0.3)).toFixed(1));
    state.telemetry.roboticArm.speed = state.speedPercent;
    
    // CNC Machine Telemetry drift
    state.telemetry.cncMachine.temp = parseFloat((45 + (30 * speedRatio) + (Math.random() * 2.0)).toFixed(1));
    state.telemetry.cncMachine.vibra = parseFloat((1.0 + (2.5 * speedRatio) + (Math.random() * 0.4)).toFixed(1));
    state.telemetry.cncMachine.speed = state.speedPercent;
    
    // Conveyor system Telemetry drift
    state.telemetry.conveyor.temp = parseFloat((25 + (10 * speedRatio) + (Math.random() * 0.8)).toFixed(1));
    state.telemetry.conveyor.vibra = parseFloat((0.3 + (0.9 * speedRatio) + (Math.random() * 0.2)).toFixed(1));
    state.telemetry.conveyor.speed = state.speedPercent;
    
    // 2. Advance SAP Production Orders Qty
    advanceProductionOrders();
    
    // 3. Output sensor telemetry log
    generateMockSensorLogs();
    
    // 4. Render Updates
    renderTelemetry();
    renderSAPOrders();
}

function decayTelemetry() {
    state.telemetry.productionRate = 0;
    
    // Decay values slowly to room ambient levels
    state.telemetry.roboticArm.temp = Math.max(24.2, parseFloat((state.telemetry.roboticArm.temp - 1.2).toFixed(1)));
    state.telemetry.roboticArm.vibra = Math.max(0.1, parseFloat((state.telemetry.roboticArm.vibra - 0.2).toFixed(1)));
    
    state.telemetry.cncMachine.temp = Math.max(26.5, parseFloat((state.telemetry.cncMachine.temp - 1.8).toFixed(1)));
    state.telemetry.cncMachine.vibra = Math.max(0.2, parseFloat((state.telemetry.cncMachine.vibra - 0.3).toFixed(1)));
    
    state.telemetry.conveyor.temp = Math.max(22.1, parseFloat((state.telemetry.conveyor.temp - 0.6).toFixed(1)));
    state.telemetry.conveyor.vibra = Math.max(0.0, parseFloat((state.telemetry.conveyor.vibra - 0.1).toFixed(1)));
}

function advanceProductionOrders() {
    const activeOrder = state.orders.find(o => o.active);
    if (!activeOrder) return;
    
    // Confirmed Qty increments based on production rate
    const increment = Math.round((state.telemetry.productionRate / 60) * 1.5);
    activeOrder.confirmed += increment;
    
    // Calculate target progress percentage
    state.telemetry.targetProgress = Math.round((activeOrder.confirmed / activeOrder.target) * 100);
    
    // If order reaches target, close and start next order
    if (activeOrder.confirmed >= activeOrder.target) {
        activeOrder.confirmed = activeOrder.target;
        activeOrder.active = false;
        
        // Log transaction trigger to OPC logs
        addConsoleLog('SAP-BAPI', `BAPI_PRODORD_CONFIRM: Yield confirmation for Order #${activeOrder.id} finished successfully.`);
        addConsoleLog('SAP-BAPI', `BAPI_GOODSMVT_CREATE: Goods receipt Z_MVT_101 posted for material ${activeOrder.material}.`);
        
        // Find next order
        const nextIdx = state.orders.indexOf(activeOrder) + 1;
        if (nextIdx < state.orders.length) {
            state.orders[nextIdx].active = true;
            addConsoleLog('SAP-RFC', `Production Order #${state.orders[nextIdx].id} released to shop floor.`);
        } else {
            // Restart cycle with new generated orders
            state.orders.forEach((o, i) => {
                o.confirmed = 0;
                o.active = i === 0;
            });
            addConsoleLog('SYSTEM', 'All scheduled production orders completed. Cycling schedules.');
        }
    }
}

function generateMockSensorLogs() {
    const r = Math.random();
    
    if (r < 0.25) {
        addConsoleLog('OPCUA', `[Robotic-Arm-01] Speed = ${state.telemetry.roboticArm.speed}%, Temp = ${state.telemetry.roboticArm.temp}°C, Vibration = ${state.telemetry.roboticArm.vibra}g`);
    } else if (r < 0.5) {
        addConsoleLog('OPCUA', `[CNC-Machine-02] Speed = ${state.telemetry.cncMachine.speed}%, Temp = ${state.telemetry.cncMachine.temp}°C, Vibration = ${state.telemetry.cncMachine.vibra}g`);
    } else if (r < 0.7 && state.telemetry.productionRate > 0) {
        // Log BAPI Goods issue occasionally during active run
        const activeOrder = state.orders.find(o => o.active);
        addConsoleLog('SAP-BAPI', `Post goods issue raw sheet steel [Mat: Z_RAW_STEEL] to Order #${activeOrder.id}`);
    }
}

// ----------------------------------------------------
// UI Render Controls
// ----------------------------------------------------
function renderTelemetry() {
    // Main metrics
    elements.valOee.innerText = `${state.telemetry.oee}%`;
    elements.valProdRate.innerText = `${state.telemetry.productionRate}/H`;
    elements.valDefectRate.innerText = `${state.telemetry.defectRate}%`;
    elements.valProgress.innerText = `${state.telemetry.targetProgress}%`;
    elements.progressBar.style.width = `${state.telemetry.targetProgress}%`;
    
    // Status color shifts
    if (state.isEmergencyHalt) {
        elements.statusText.innerText = 'EMERGENCY SHUTDOWN';
        elements.statusText.style.color = 'var(--neon-danger)';
    } else if (!state.isRunning) {
        elements.statusText.innerText = 'PRODUCTION PAUSED';
        elements.statusText.style.color = 'var(--neon-warning)';
        elements.statusDot.className = 'status-dot warning';
    } else {
        elements.statusText.innerText = 'RUNNING (ONLINE)';
        elements.statusText.style.color = 'var(--neon-green)';
        elements.statusDot.className = 'status-dot';
    }
    
    // Card levels
    elements.robotTemp.innerText = `${state.telemetry.roboticArm.temp}°C`;
    elements.robotVibra.innerText = `${state.telemetry.roboticArm.vibra}g`;
    elements.robotSpeed.innerText = `${state.telemetry.roboticArm.speed}%`;
    document.getElementById('robot-fill').style.width = `${state.telemetry.roboticArm.speed}%`;
    
    elements.cncTemp.innerText = `${state.telemetry.cncMachine.temp}°C`;
    elements.cncVibra.innerText = `${state.telemetry.cncMachine.vibra}g`;
    elements.cncSpeed.innerText = `${state.telemetry.cncMachine.speed}%`;
    document.getElementById('cnc-fill').style.width = `${state.telemetry.cncMachine.speed}%`;
    
    elements.conveyorTemp.innerText = `${state.telemetry.conveyor.temp}°C`;
    elements.conveyorVibra.innerText = `${state.telemetry.conveyor.vibra}g`;
    elements.conveyorSpeed.innerText = `${state.telemetry.conveyor.speed}%`;
    document.getElementById('conv-fill').style.width = `${state.telemetry.conveyor.speed}%`;
}

function renderSAPOrders() {
    elements.ordersList.innerHTML = '';
    
    state.orders.forEach(order => {
        const div = document.createElement('div');
        div.className = 'order-item';
        if (order.active) {
            div.style.borderColor = 'var(--neon-blue)';
            div.style.background = 'rgba(0, 242, 254, 0.02)';
        }
        
        const prog = Math.round((order.confirmed / order.target) * 100);
        
        div.innerHTML = `
            <div class="order-info">
                <span class="order-id">🛠️ Order #${order.id} ${order.active ? '<span class="badge active-badge" style="background:rgba(0,242,254,0.15); color:var(--neon-blue); font-size:9px; padding: 1px 4px; border-radius:3px; margin-left:4px;">ACTIVE</span>' : ''}</span>
                <span class="order-material">Mat: ${order.material}</span>
            </div>
            <div class="order-qty-box">
                <span class="order-qty">${order.confirmed} / ${order.target}</span>
                <div class="order-progress">Yield: ${prog}%</div>
            </div>
        `;
        
        elements.ordersList.appendChild(div);
    });
}

function renderABAPCode() {
    const rawCode = ABAP_CODE_SNIPPETS[state.currentTab];
    elements.codeViewer.innerHTML = highlightABAP(rawCode);
}

function addConsoleLog(topic, message) {
    const time = new Date().toLocaleTimeString();
    const row = document.createElement('div');
    row.className = 'console-row';
    
    let topicColor = 'var(--neon-warning)';
    if (topic === 'SAP-BAPI') topicColor = 'var(--neon-purple)';
    if (topic === 'SAP-RFC') topicColor = 'var(--neon-blue)';
    if (topic === 'ALARM') topicColor = 'var(--neon-danger)';
    if (topic === 'SYSTEM') topicColor = 'var(--text-muted)';
    
    row.innerHTML = `
        <span class="console-timestamp">[${time}]</span>
        <span class="console-topic" style="color: ${topicColor}">[${topic}]</span>
        <span>${message}</span>
    `;
    
    elements.consoleBody.appendChild(row);
    elements.consoleBody.scrollTop = elements.consoleBody.scrollHeight;
}

// ----------------------------------------------------
// ABAP Highlighter Helper
// ----------------------------------------------------
const ABAP_KEYWORDS = [
    'REPORT', 'FORM', 'ENDFORM', 'DATA', 'TABLE', 'OF', 'FUNCTION', 'ENDFUNCTION',
    'IMPORTING', 'EXPORTING', 'CHANGING', 'TABLES', 'VALUE', 'TYPE', 'INSERT', 'FROM',
    'IF', 'ELSE', 'ENDIF', 'COMMIT', 'WORK', 'WAIT', 'ROLLBACK', 'CALL', 'EXPORT',
    'READ', 'KEY', 'WITH', 'TRANSPORTING', 'FIELDS', 'APPEND', 'TO', 'AND', 'USING'
];

function highlightABAP(code) {
    if (!code) return '';
    const lines = code.split('\n');
    
    const highlighted = lines.map(line => {
        if (line.trim().startsWith('*') || line.trim().startsWith('"')) {
            return `<span class="abap-comment">${escapeHtml(line)}</span>`;
        }
        
        let escaped = escapeHtml(line);
        
        // Strings '...'
        const strings = [];
        escaped = escaped.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match) => {
            strings.push(`<span class="abap-string">${match}</span>`);
            return `__STR_${strings.length - 1}__`;
        });
        
        // Comments " ...
        let commentPart = '';
        const commentIndex = escaped.indexOf('"');
        if (commentIndex !== -1) {
            commentPart = `<span class="abap-comment">${escaped.substring(commentIndex)}</span>`;
            escaped = escaped.substring(0, commentIndex);
        }
        
        // Numbers
        escaped = escaped.replace(/\b(\d+)\b/g, '<span class="abap-number">$1</span>');
        
        // Keywords
        const wordRegex = /\b([a-zA-Z0-9_\-]+)\b/g;
        escaped = escaped.replace(wordRegex, (match) => {
            const upper = match.toUpperCase();
            if (ABAP_KEYWORDS.includes(upper)) {
                return `<span class="abap-keyword">${match}</span>`;
            }
            return match;
        });
        
        // Restore strings
        strings.forEach((strHtml, idx) => {
            escaped = escaped.replace(`__STR_${idx}__`, strHtml);
        });
        
        return escaped + commentPart;
    });
    
    return highlighted.join('\n');
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ----------------------------------------------------
// Dolphin Pod Background Simulation
// ----------------------------------------------------
const DOLPHIN_IMAGES = [
    'https://images.unsplash.com/photo-1570481662006-a3a1374699e8?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1551244072-5d12893278ab?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1607185642220-4b7f7f022736?auto=format&fit=crop&w=600&q=80'
];

function initDolphinAquarium() {
    const aquarium = document.getElementById('dolphin-aquarium');
    if (!aquarium) return;

    function spawnDolphin(isInitial = false) {
        if (aquarium.children.length >= 5) return;

        const dolphin = document.createElement('div');
        dolphin.className = 'dolphin';

        // Randomized attributes for each dolphin in the pod
        const size = Math.random() * 100 + 400;      // 400px to 500px wide
        const topPos = Math.random() * 65 + 15;    // 15% to 80% screen height to avoid collisions
        const duration = Math.random() * 15 + 20;  // 20s to 35s speed
        const direction = Math.random() < 0.5 ? 'swim-right' : 'swim-left';
        
        dolphin.style.width = `${size}px`;
        dolphin.style.height = `${size / 2}px`;
        dolphin.style.top = `${topPos}%`;
        
        // Single swim cycle animation (bobbing is integrated)
        dolphin.style.animation = `${direction} ${duration}s linear forwards`;

        // If initializing, pre-populate them across the screen using negative delays
        if (isInitial) {
            const delay = Math.random() * -duration;
            dolphin.style.animationDelay = `${delay}s`;
        } else {
            dolphin.style.animationDelay = `0s`;
        }

        const wiggleDuration = Math.random() * 0.4 + 1.3; // 1.3s to 1.7s
        const wiggleDelay = Math.random() * -2.5; // Randomize start phase
        const randomImage = DOLPHIN_IMAGES[Math.floor(Math.random() * DOLPHIN_IMAGES.length)];

        dolphin.innerHTML = `
            <img src="${randomImage}" alt="Dolphin" style="animation: dolphin-wiggle ${wiggleDuration}s ease-in-out infinite; animation-delay: ${wiggleDelay}s;">
        `;

        aquarium.appendChild(dolphin);

        // Log to telemetry console for visual confirmation
        addConsoleLog('SYSTEM', `Dolphin spawned (${Math.round(size)}px photo, ${direction === 'swim-right' ? 'Heading Right →' : 'Heading Left ←'})`);

        // Remove element from DOM once it finishes swimming across the screen
        setTimeout(() => {
            dolphin.remove();
        }, duration * 1000);
    }

    // Spawn initial pod of 3 dolphins
    for (let i = 0; i < 3; i++) {
        spawnDolphin(true);
    }

    // Periodically spawn new dolphins
    setInterval(() => {
        spawnDolphin(false);
    }, 6000);
}
