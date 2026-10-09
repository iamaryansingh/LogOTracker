Pod::Spec.new do |s|
  s.name           = 'SelfMirrorAlarms'
  s.version        = '1.0.0'
  s.summary        = 'Schedules real alarms through AlarmKit (iOS 26+).'
  s.author         = ''
  s.homepage       = 'https://github.com/iamaryansingh/LogOTracker'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # AlarmKit only exists on iOS 26+, so it's linked weakly and every use is behind #available.
  s.weak_frameworks = 'AlarmKit'
  s.source_files = '**/*.{h,m,swift}'
end
