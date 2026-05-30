# Joint Operations: Resurgence

## Project Summary
A super basic realistic tactical shooter prototype in Unreal Engine 5 inspired by the grounded feel of games like Gray Zone Warfare, but scoped tightly enough to actually finish as a vertical slice.

### Core Scope
- 1 map
- first-person shooter
- realistic-ish movement and gun feel
- 1 enemy team/faction
- 5 weapons
- reloads, ADS, ammo, recoil
- simple combat objective

## Design Goal
Build a playable one-map tactical shooter sandbox with believable gun handling, simple enemy combat, and a clean vertical-slice structure.

## Core Features
### Player
- first-person movement
- sprint
- crouch
- aim down sights
- fire
- reload
- weapon swap
- health / death

### Weapons
1. M4-style rifle
2. AK-style rifle
3. SMG
4. Pistol
5. DMR / battle rifle

Each weapon should support:
- mag ammo + reserve ammo
- reload timing
- recoil
- damage
- fire rate
- range/spread
- ADS FOV
- muzzle/audio/impact FX

### Enemy Team
- one enemy faction
- idle / patrol
- detect player
- attack player
- take damage
- die

### Map
- one medium tactical test map
- outdoor + indoor section
- cover lanes
- combat space with realistic-ish layout

### UI
- health
- weapon name
- current mag ammo
- reserve ammo

## Unreal Engine Approach
### Recommended style
- Blueprint-heavy
- optional C++ later only if needed

### Shooting model
- hitscan first
- do not start with full ballistics

## Folder Structure
- `Content/Blueprints/Player/`
- `Content/Blueprints/Weapons/`
- `Content/Blueprints/AI/`
- `Content/Blueprints/UI/`
- `Content/Blueprints/Game/`
- `Content/Data/Weapons/`
- `Content/Maps/`
- `Content/Animations/`
- `Content/Audio/`
- `Content/FX/`

## Core Blueprints
- `BP_PlayerCharacter`
- `BP_WeaponBase`
- `BP_Weapon_M4`
- `BP_Weapon_AK`
- `BP_Weapon_SMG`
- `BP_Weapon_Pistol`
- `BP_Weapon_DMR`
- `BP_EnemyBase`
- `BP_GameMode_Shooter`
- `WBP_HUD`

## Player Blueprint Architecture
### `BP_PlayerCharacter`
Responsibilities:
- movement
- ADS
- firing input
- reload input
- weapon switching
- health / death
- HUD updates

Key variables:
- `Health`
- `MaxHealth`
- `CurrentWeapon`
- `WeaponInventory`
- `CurrentWeaponIndex`
- `bIsADS`
- `bIsSprinting`
- `bIsReloading`
- `bIsDead`
- `DefaultFOV`
- `CurrentTargetFOV`

Key functions:
- `HandleFireInput()`
- `HandleReloadInput()`
- `HandleWeaponSwap()`
- `SetADS()`
- `ApplyDamage()`
- `Die()`
- `UpdateHUD()`

## Weapon Blueprint Architecture
### `BP_WeaponBase`
Responsibilities:
- weapon stats
- firing logic
- hitscan logic
- ammo tracking
- reload logic
- recoil
- FX and audio

Key variables:
- `WeaponName`
- `Damage`
- `HeadshotMultiplier`
- `FireRate`
- `MagSize`
- `CurrentAmmoInMag`
- `ReserveAmmo`
- `ReloadDuration`
- `Range`
- `Spread`
- `RecoilPitch`
- `RecoilYaw`
- `ADSFOV`
- `bIsAutomatic`
- `bCanFire`
- `bIsReloading`

Key functions:
- `CanFire()`
- `Fire()`
- `TraceShot()`
- `ApplyRecoil()`
- `CanReload()`
- `Reload()`
- `FinishReload()`

## Enemy AI Architecture
### `BP_EnemyBase`
Responsibilities:
- detect player
- engage player
- shoot player
- receive damage
- die

Key variables:
- `Health`
- `TargetActor`
- `DetectionRange`
- `AttackRange`
- `FireRate`
- `Damage`
- `bIsDead`
- `bCanFire`
- `bIsAlerted`

## Enemy AI Flow
### States
- Idle
- Alerted
- Attack
- Search / Chase
- Dead

### Flow
Idle -> detects player -> Alerted -> visible/in range -> Attack -> loses line of sight -> Search/Chase -> reacquire -> Attack -> death -> Dead

## Weapon Stat Sheet
### M4
- Damage: 32
- Headshot Multiplier: 2.0
- Fire Rate: 700 RPM
- Mag Size: 30
- Reserve Ammo: 120
- Reload: 2.2s
- Range: 12000
- Spread: 1.2
- Recoil Pitch: 1.0
- Recoil Yaw: 0.45
- ADS FOV: 70
- Automatic: true

### AK
- Damage: 38
- Headshot Multiplier: 2.0
- Fire Rate: 600 RPM
- Mag Size: 30
- Reserve Ammo: 120
- Reload: 2.5s
- Range: 11000
- Spread: 1.5
- Recoil Pitch: 1.35
- Recoil Yaw: 0.75
- ADS FOV: 70
- Automatic: true

### SMG
- Damage: 24
- Headshot Multiplier: 1.8
- Fire Rate: 900 RPM
- Mag Size: 35
- Reserve Ammo: 140
- Reload: 2.0s
- Range: 5500
- Spread: 1.8
- Recoil Pitch: 0.85
- Recoil Yaw: 0.4
- ADS FOV: 72
- Automatic: true

### Pistol
- Damage: 28
- Headshot Multiplier: 2.0
- Fire Rate: 420 RPM
- Mag Size: 15
- Reserve Ammo: 60
- Reload: 1.6s
- Range: 4500
- Spread: 1.3
- Recoil Pitch: 0.9
- Recoil Yaw: 0.35
- ADS FOV: 74
- Automatic: false

### DMR
- Damage: 52
- Headshot Multiplier: 2.2
- Fire Rate: 280 RPM
- Mag Size: 20
- Reserve Ammo: 80
- Reload: 2.7s
- Range: 18000
- Spread: 0.8
- Recoil Pitch: 1.6
- Recoil Yaw: 0.65
- ADS FOV: 62
- Automatic: false

## Data Table Format
### `ST_WeaponStats`
Fields:
- `WeaponID`
- `WeaponName`
- `Damage`
- `HeadshotMultiplier`
- `FireRate`
- `MagSize`
- `StartingReserveAmmo`
- `ReloadDuration`
- `Range`
- `Spread`
- `RecoilPitch`
- `RecoilYaw`
- `ADSFOV`
- `bIsAutomatic`

## Milestone Plan
### Milestone 1
- player controller
- M4 weapon
- ADS
- fire
- reload
- ammo UI
- test room

### Milestone 2
- enemy health
- enemy AI
- enemy death
- player damage
- restart loop

### Milestone 3
- add remaining 4 weapons
- weapon swap
- weapon tuning

### Milestone 4
- realism polish
- recoil tuning
- reload/audio polish
- impact FX
- movement tuning

### Milestone 5
- final map
- combat space
- one objective
- complete vertical slice

## Workflow Diagram
### Start -> Finish
Project Setup
-> Player Blueprint
-> Weapon Base
-> One Rifle
-> HUD
-> Enemy AI
-> All Weapons
-> Map
-> Polish
-> Objective Loop
-> Finished Prototype

## First Build Order
1. `BP_PlayerCharacter`
2. `BP_WeaponBase`
3. `BP_Weapon_M4`
4. `WBP_HUD`
5. `BP_EnemyBase`
6. `BP_GameMode_Shooter`

## First Week Development Schedule
### Session 1
- create project
- create folder structure
- create player blueprint
- create weapon base
- create M4
- create HUD

### Session 2
- M4 firing
- ammo system
- reload
- ADS
- HUD hookup

### Session 3
- enemy base
- health / damage / death
- simple detection
- simple attack

### Session 4
- gray-box map
- player spawn
- enemy placements
- cover / lanes

### Session 5
- remaining weapons
- tuning pass
- playtest full combat loop

## Recommendation
Do not start with all 5 guns at once. Make the M4 feel right first, then duplicate and tune the other weapons from that working baseline.
