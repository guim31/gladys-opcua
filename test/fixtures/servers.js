// -----------------------------------------------------------------------------
// Address spaces of real servers, as the client reads them.
//
// - OPC_PLC: the Microsoft OPC PLC simulator (mcr.microsoft.com/iotedge/
//   opc-plc), Telemetry folder: NodeIds, types, access and display names read
//   from the image on 2026-11-20 (the values are a snapshot).
// - S7_1500: a Siemens S7-1500 with its OPC UA server on, data blocks named
//   the TIA Portal way (ns=3;s="DB".."Member"); values invented.
// -----------------------------------------------------------------------------

export const OPC_PLC = {
  'ns=3;s=StepUp': {
    type: 'UInt32',
    value: 144,
    writable: true,
    displayName: 'StepUp',
    path: 'Telemetry/StepUp',
  },
  'ns=3;s=AlternatingBoolean': {
    type: 'Boolean',
    value: false,
    displayName: 'AlternatingBoolean',
    path: 'Telemetry/AlternatingBoolean',
  },
  'ns=3;s=RandomSignedInt32': {
    type: 'Int32',
    value: -507628143,
    displayName: 'RandomSignedInt32',
    path: 'Telemetry/RandomSignedInt32',
  },
  'ns=3;s=RandomUnsignedInt32': {
    type: 'UInt32',
    value: 1430809573,
    displayName: 'RandomUnsignedInt32',
    path: 'Telemetry/RandomUnsignedInt32',
  },
  'ns=3;s=SlowUInt1': {
    type: 'UInt32',
    value: 43,
    writable: true,
    displayName: 'SlowUInt1',
    path: 'Telemetry/Slow/SlowUInt1',
  },
  'ns=3;s=FastUInt1': {
    type: 'UInt32',
    value: 467,
    writable: true,
    displayName: 'FastUInt1',
    path: 'Telemetry/Fast/FastUInt1',
  },
};

export const OPC_PLC_VARIABLES =
  'Step: ns=3;s=StepUp write; Slow: ns=3;s=SlowUInt1; Alternating: ns=3;s=AlternatingBoolean; ' +
  'ns=3;s=RandomSignedInt32; Boiler: ns=3;s=FastUInt1 temperature scale=0.1';

export const S7_1500 = {
  'ns=3;s="Boiler"."FlowTemperature"': {
    type: 'Float',
    value: 61.29999923706055,
    displayName: 'FlowTemperature',
  },
  'ns=3;s="Boiler"."Setpoint"': {
    type: 'Float',
    value: 55,
    writable: true,
    displayName: 'Setpoint',
  },
  'ns=3;s="Boiler"."Pump"': { type: 'Boolean', value: true, writable: true, displayName: 'Pump' },
  'ns=3;s="Boiler"."Alarm"': { type: 'Boolean', value: false, displayName: 'Alarm' },
  'ns=3;s="Meter"."Energy"': { type: 'UInt64', value: [0, 12_345_678], displayName: 'Energy' },
  'ns=3;s="Meter"."Power"': { type: 'Int32', value: -1520, displayName: 'Power' },
  'ns=3;s="Plant"."Mode"': { type: 'String', value: 'AUTO', writable: true, displayName: 'Mode' },
  'ns=3;s="Plant"."LastStart"': {
    type: 'DateTime',
    value: new Date('2026-11-19T06:00:00Z'),
    displayName: 'LastStart',
  },
  'ns=3;s="Plant"."Pressures"': {
    type: 'Float',
    value: [1.2, 1.4],
    isArray: true,
    displayName: 'Pressures',
  },
  'ns=3;s="Plant"."Recipe"': { type: 'ExtensionObject', value: {}, displayName: 'Recipe' },
};

export const S7_1500_VARIABLES = [
  'Flow temperature: ns=3;s="Boiler"."FlowTemperature" temperature precision=1',
  'Boiler setpoint: ns=3;s="Boiler"."Setpoint" setpoint',
  'Circulation pump: ns=3;s="Boiler"."Pump" switch',
  'Boiler alarm: ns=3;s="Boiler"."Alarm"',
  'Energy: ns=3;s="Meter"."Energy" energy unit=Wh',
  'Grid power: ns=3;s="Meter"."Power" grid_power',
  'Mode: ns=3;s="Plant"."Mode" write',
  'Last start: ns=3;s="Plant"."LastStart"',
].join('; ');
