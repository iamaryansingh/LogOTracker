Pod::Spec.new do |s|
  s.name           = 'SelfMirrorVision'
  s.version        = '1.0.0'
  s.summary        = 'Describes photos on device with Apple Vision, for memory captions.'
  s.author         = ''
  s.homepage       = 'https://github.com/iamaryansingh/LogOTracker'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'
  s.source_files = '**/*.{h,m,swift}'
end
