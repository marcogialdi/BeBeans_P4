// Dati di esempio per la modalità dimostrativa (?demo). Nessun VIN, nessuna chiamata reale.

const now = () => ({ seconds: String(Math.floor(Date.now() / 1000) - 240), nanos: 0 });
const at = (hour, minute) => ({ hour, minute, timeZone: { offsetMinutes: 120 } });

export function demoSnapshot() {
  return {
    car: "auto-1",
    fetchedAt: new Date().toISOString(),
    unavailable: ["ampLimit", "chargeLocations", "isAtChargeLocation"],
    errors: {},
    data: {
      availability: { timestamp: now(), availabilityStatus: "AVAILABILITY_STATUS_AVAILABLE", usageMode: "USAGE_MODE_PARKED" },
      battery: {
        timestamp: now(),
        averageEnergyConsumptionKwhPer100Km: 17.8,
        averageEnergyConsumptionKwhPer100KmAutomatic: 16.9,
        averageEnergyConsumptionKwhPer100KmSinceCharge: 17.2,
        batteryChargeLevelPercentage: 78,
        chargerConnectionStatus: "CHARGER_CONNECTION_STATUS_CONNECTED",
        chargingPowerWatts: 10800,
        chargingStatusV2: "CHARGING_STATUS_CHARGING",
        chargingType: "CHARGING_TYPE_AC",
        chargingCurrentAmps: 16,
        chargingVoltageVolts: 230,
        dischargeInfo: { energyAvailable: 58.4 },
        energyConsumptionPercentageSinceCharge: { driving: 72, climate: 16, battery: 7, other: 5 },
        energyConsumptionWhSinceCharge: { driving: 10600, climate: 2400, battery: 1000, other: 700 },
        energyConsumptionPercentageAutomatic: { driving: 80, climate: 10, battery: 6, other: 4 },
        energyConsumptionWhAutomatic: { driving: 3100, climate: 390, battery: 230, other: 150 },
        estimatedChargingTimeToFullMinutes: 100,
        estimatedChargingTimeMinutesToMinimumSoc: 0,
        estimatedDistanceToEmptyKm: 342,
      },
      exterior: {
        timestamp: now(),
        centralLock: "LOCK_STATUS_LOCKED",
        frontLeftDoor: "OPEN_STATUS_CLOSED", frontRightDoor: "OPEN_STATUS_CLOSED",
        rearLeftDoor: "OPEN_STATUS_CLOSED", rearRightDoor: "OPEN_STATUS_CLOSED",
        frontLeftWindow: "OPEN_STATUS_CLOSED", frontRightWindow: "OPEN_STATUS_CLOSED",
        rearLeftWindow: "OPEN_STATUS_CLOSED", rearRightWindow: "OPEN_STATUS_CLOSED",
        hood: "OPEN_STATUS_CLOSED", tailgate: "OPEN_STATUS_CLOSED", sunroof: "OPEN_STATUS_CLOSED",
        alarm: "ALARM_STATUS_ARMED",
      },
      health: {
        timestamp: now(),
        daysToService: 212,
        distanceToServiceKm: 5682,
        serviceWarning: "SERVICE_WARNING_NO_WARNING",
        brakeFluidLevelWarning: "NO_WARNING",
        washerFluidLevelWarning: "NO_WARNING",
        lowVoltageBatteryWarning: "NO_WARNING",
        frontLeftTyrePressureKpa: 248, frontRightTyrePressureKpa: 251,
        rearLeftTyrePressureKpa: 268, rearRightTyrePressureKpa: 266,
        frontLeftTyrePressureWarning: "NO_WARNING", frontRightTyrePressureWarning: "NO_WARNING",
        rearLeftTyrePressureWarning: "NO_WARNING", rearRightTyrePressureWarning: "NO_WARNING",
        frontTyresReferencePressureKpa: 250, rearTyresReferencePressureKpa: 270,
        lightWarnings: { brakeLightAny: "NO_WARNING", lowBeamAny: "NO_WARNING" },
      },
      location: { timestamp: { seconds: String(Math.floor(Date.now() / 1000) - 720), nanos: 0 }, coordinate: { latitude: 45.0703, longitude: 7.6869 }, heading: 90, speed: "0", altitude: "239" },
      odometer: { timestamp: now(), odometerMeters: 24318000, tripMeterSinceChargeKm: 86, averageSpeedKmPerHourSinceCharge: 46 },
      parkingClimatization: {
        timestamp: now(), runningStatus: "RUNNING_STATUS_NOT_RUNNING",
        currentCompartmentTemperatureCelsius: 19.5, requestedCompartmentTemperatureCelsius: 21,
      },
      preCleaning: { timestamp: now(), measuredAirQualityIndex: 12, measuredParticulateMatter25: 4, runningStatus: "RUNNING_STATUS_NOT_RUNNING" },
      ampLimit: null,
      chargeLocations: null,
      chargeNow: { syncedOverrideChargeTimer: { override: false } },
      globalChargeTimer: { globalChargeTimer: { start: at(23, 0), stop: at(6, 0), activated: true } },
      isAtChargeLocation: null,
      parkingClimateTimer: {
        parkingClimateTimers: [
          { timerId: "t1", readyAt: at(7, 30), activated: true, repeat: true, weekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] },
        ],
        timerSettings: {
          seatHeatingIntensity: { frontRowLeftSeat: "INTENSITY_MEDIUM" },
          steeringWheelHeatingIntensity: "INTENSITY_HIGH",
          requestedCompartmentTemperatureCelsius: 21,
          batteryPreconditioning: "BATTERY_PRECONDITIONING_ON",
        },
      },
      targetSoc: { targetSoc: { batteryChargeTargetLevel: 90 }, pendingTargetSoc: null },
    },
  };
}

export function demoHistory() {
  const rows = [];
  const end = Date.now();
  let soc = 62;
  for (let t = end - 7 * 86_400_000; t <= end; t += 3 * 3_600_000) {
    const hour = new Date(t).getHours();
    if (hour >= 23 || hour < 6) soc = Math.min(90, soc + 9);
    else if (hour >= 7 && hour <= 9) soc -= 6;
    else if (hour >= 17 && hour <= 19) soc -= 7;
    else soc -= 1;
    soc = Math.max(18, soc);
    rows.push({ taken_at: new Date(t).toISOString(), soc });
  }
  rows.push({ taken_at: new Date(end).toISOString(), soc: 78 });
  return rows;
}
