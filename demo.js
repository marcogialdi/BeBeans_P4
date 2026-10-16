// Dati di esempio per la modalità dimostrativa (?demo). Nessun VIN, nessuna chiamata reale.

const now = () => ({ seconds: String(Math.floor(Date.now() / 1000) - 240), nanos: 0 });
const at = (hour, minute) => ({ hour, minute, timeZone: { offsetMinutes: 120 } });

export function demoSnapshot() {
  return {
    car: "auto-1",
    fetchedAt: new Date().toISOString(),
    unavailable: ["ampLimit"],
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
        energyConsumptionPercentageManual: { driving: 75, climate: 14, battery: 6, other: 5 },
        energyConsumptionWhManual: { driving: 186000, climate: 34700, battery: 14900, other: 12400 },
        totalEnergyConsumptionWh: 248000,
        totalEnergyConsumptionWhAutomatic: 3870,
        totalEnergyConsumptionWhSinceCharge: 14700,
        estimatedChargingTimeToFullMinutes: 100,
        estimatedChargingTimeMinutesToMinimumSoc: 0,
        estimatedChargingTimeMinutesToTargetDistance: 35,
        estimatedDistanceToEmptyKm: 342,
        chargerPowerStatus: "CHARGER_POWER_STATUS_PROVIDING_POWER",
        manualPreconditioning: { preconditioningStatus: "PRECONDITIONING_STATUS_OFF", startedAt: { seconds: String(Math.floor(Date.now() / 1000) - 26 * 3600), nanos: 0 } },
      },
      exterior: {
        timestamp: now(),
        centralLock: "LOCK_STATUS_LOCKED",
        frontLeftDoor: "OPEN_STATUS_CLOSED", frontRightDoor: "OPEN_STATUS_CLOSED",
        rearLeftDoor: "OPEN_STATUS_CLOSED", rearRightDoor: "OPEN_STATUS_CLOSED",
        frontLeftWindow: "OPEN_STATUS_CLOSED", frontRightWindow: "OPEN_STATUS_CLOSED",
        rearLeftWindow: "OPEN_STATUS_CLOSED", rearRightWindow: "OPEN_STATUS_CLOSED",
        hood: "OPEN_STATUS_CLOSED", tailgate: "OPEN_STATUS_CLOSED", sunroof: "OPEN_STATUS_CLOSED",
        tailgateLock: "LOCK_STATUS_LOCKED", tankLid: "OPEN_STATUS_CLOSED",
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
        engineCoolantLevelWarning: "NO_WARNING",
        lightWarnings: {
          brakeLightLeft: "NO_WARNING", brakeLightRight: "NO_WARNING", brakeLightCenter: "NO_WARNING",
          lowBeamLeft: "NO_WARNING", lowBeamRight: "NO_WARNING", highBeamLeft: "NO_WARNING", highBeamRight: "NO_WARNING",
          turnIndicatorFrontLeft: "NO_WARNING", turnIndicatorFrontRight: "NO_WARNING",
          turnIndicatorRearLeft: "NO_WARNING", turnIndicatorRearRight: "NO_WARNING",
          fogLightRear: "NO_WARNING", daytimeRunningLightLeft: "NO_WARNING", daytimeRunningLightRight: "NO_WARNING",
          positionLightRearLeft: "NO_WARNING", positionLightRearRight: "NO_WARNING",
          registrationPlateLight: "NO_WARNING", reverseLightAny: "NO_WARNING",
        },
      },
      location: { timestamp: { seconds: String(Math.floor(Date.now() / 1000) - 720), nanos: 0 }, coordinate: { latitude: 45.0703, longitude: 7.6869 }, heading: 90, speed: "0", altitude: "239" },
      odometer: {
        timestamp: now(), odometerMeters: 24318000,
        tripMeterSinceChargeKm: 86, averageSpeedKmPerHourSinceCharge: 46,
        tripMeterAutomaticKm: 22.9, averageSpeedKmPerHourAutomatic: 38,
        tripMeterManualKm: 1394, averageSpeedKmPerHour: 52,
      },
      parkingClimatization: {
        timestamp: now(), runningStatus: "RUNNING_STATUS_NOT_RUNNING", startReason: "START_REASON_TIMER",
        currentCompartmentTemperatureCelsius: 19.5, requestedCompartmentTemperatureCelsius: 21,
        requestedRearLeftSeat: "INTENSITY_OFF",
      },
      preCleaning: {
        timestamp: now(), measuredAirQualityIndex: 12, measuredParticulateMatter25: 4, runningStatus: "RUNNING_STATUS_NOT_RUNNING",
        lastCycleCompleted: { seconds: String(Math.floor(Date.now() / 1000) - 5 * 3600), nanos: 0 }, lastCycleValid: true,
        measurementDate: { seconds: String(Math.floor(Date.now() / 1000) - 600), nanos: 0 },
      },
      ampLimit: null,
      chargeLocations: {
        chargeLocations: [
          { locationId: "home", locationAlias: "Casa", coordinate: { latitude: 45.0706, longitude: 7.6874 }, minimumSoc: 20, ampLimit: 16,
            isOptimizedChargingEnabled: true, locationType: "LOCATION_TYPE_HOME",
            departureTimes: [{ activated: true, departureTime: at(7, 45), activeDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] }] },
        ],
      },
      isAtChargeLocation: { locationId: "home", arrivedAtTimestamp: { seconds: String(Math.floor(Date.now() / 1000) - 3 * 3600), nanos: 0 } },
      chargeNow: { syncedOverrideChargeTimer: { override: false } },
      globalChargeTimer: { globalChargeTimer: { start: at(23, 0), stop: at(6, 0), activated: true } },
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
