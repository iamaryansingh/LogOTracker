Pod::Spec.new do |s|
  s.name           = 'SelfMirrorHeart'
  s.version        = '1.0.0'
  s.summary        = 'Live heart rate from a Bluetooth monitor (WHOOP heart rate broadcast, chest straps).'
  s.author         = ''
  s.homepage       = 'https://github.com/iamaryansingh/LogOTracker'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth'
  # The smart REM alarm rings through AlarmKit (iOS 26+), linked weakly.
  s.weak_frameworks = 'AlarmKit'
  s.source_files = '**/*.{h,m,swift}'
end
